'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { convertPrice } from '@/lib/currency';
import { getBuyerCurrency } from '@/lib/buyerCurrency';

const CartContext = createContext(null);
const LOCAL_KEY = 'wenna_cart_guest';
const CHECKOUT_KEY = 'wenna_checkout_idempotency_key';

// ── Clé d'idempotence de commande ───────────────────────────────────
// Générée une seule fois au début d'une tentative de paiement, réutilisée
// tant que la commande n'a pas abouti (double-clic, coupure réseau, retry).
// Effacée dès que la commande est créée avec succès.
function getOrCreateIdempotencyKey() {
  if (typeof window === 'undefined') return null;
  let key = sessionStorage.getItem(CHECKOUT_KEY);
  if (!key) {
    key = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sessionStorage.setItem(CHECKOUT_KEY, key);
  }
  return key;
}
function clearIdempotencyKey() {
  try { sessionStorage.removeItem(CHECKOUT_KEY); } catch {}
}

// ── Panier local (mode invité / hors-ligne) ─────────────────────────
// Le navigateur garde le panier même sans connexion internet.
// Dès que le client se connecte, ce panier est transféré vers son compte.
function readLocalCart() {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
  catch { return []; }
}
function writeLocalCart(items) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); } catch {}
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [userId, setUserId] = useState(null); // id interne (table users), pas l'auth id
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();

    if (!user) {
      setUserId(null);
      setItems(readLocalCart());
      setLoading(false);
      return;
    }

    const { data: row } = await sb.from('users').select('id').eq('auth_id', user.id).maybeSingle();
    if (!row) {
      setUserId(null);
      setItems(readLocalCart());
      setLoading(false);
      return;
    }

    // Transférer le panier invité vers le compte, une seule fois
    const guest = readLocalCart();
    if (guest.length) {
      for (const it of guest) {
        const { data: existing } = await sb.from('cart_items').select('id, quantity')
          .eq('user_id', row.id).eq('product_id', it.product_id).maybeSingle();
        if (existing) {
          await sb.from('cart_items').update({ quantity: existing.quantity + it.quantity }).eq('id', existing.id);
        } else {
          await sb.from('cart_items').insert({ user_id: row.id, product_id: it.product_id, quantity: it.quantity });
        }
      }
      writeLocalCart([]);
    }

    setUserId(row.id);
    const { data } = await sb.from('cart_items')
      .select('id, quantity, product_id, products(id, name, price, currency, image_url, images, stock, shop_id)')
      .eq('user_id', row.id);

    setItems((data || []).map(i => ({
      cart_item_id: i.id,
      product_id: i.product_id,
      quantity: i.quantity,
      name: i.products?.name || '—',
      price: i.products?.price || 0,
      currency: i.products?.currency || 'MAD',
      shop_id: i.products?.shop_id || null,
      image: Array.isArray(i.products?.images) && i.products.images.length ? i.products.images[0] : (i.products?.image_url || null),
      stock: i.products?.stock ?? null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Un panier ne peut contenir des produits que d'une seule boutique à la
  // fois : au-delà de mélanger les livraisons, des devises différentes
  // additionnées donneraient un total de commande incohérent (voir
  // createOrder). On bloque l'ajout plutôt que de produire un panier cassé.
  const add = useCallback(async (product, qty = 1) => {
    const currentShopId = items[0]?.shop_id || null;
    if (currentShopId && product.shop_id && product.shop_id !== currentShopId) {
      return { success: false, error: 'different_shop' };
    }
    const sb = getSupabase();
    if (!userId) {
      const guest = readLocalCart();
      const existing = guest.find(i => i.product_id === product.id);
      if (existing) existing.quantity += qty;
      else guest.push({
        product_id: product.id, name: product.name, price: product.price,
        image: product.image_url || product.image || null,
        currency: product.currency || 'MAD', shop_id: product.shop_id || null, quantity: qty,
      });
      writeLocalCart(guest);
      setItems(guest.map(g => ({ ...g, cart_item_id: g.product_id })));
      return { success: true };
    }
    const { data: existing } = await sb.from('cart_items').select('id, quantity')
      .eq('user_id', userId).eq('product_id', product.id).maybeSingle();
    if (existing) {
      await sb.from('cart_items').update({ quantity: existing.quantity + qty }).eq('id', existing.id);
    } else {
      await sb.from('cart_items').insert({ user_id: userId, product_id: product.id, quantity: qty });
    }
    await refresh();
    return { success: true };
  }, [userId, refresh, items]);

  const updateQuantity = useCallback(async (cartItemId, quantity) => {
    if (quantity <= 0) return remove(cartItemId);
    if (!userId) {
      const guest = readLocalCart().map(g => g.product_id === cartItemId ? { ...g, quantity } : g);
      writeLocalCart(guest);
      setItems(guest.map(g => ({ ...g, cart_item_id: g.product_id })));
      return;
    }
    const sb = getSupabase();
    await sb.from('cart_items').update({ quantity }).eq('id', cartItemId);
    await refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refresh]);

  const remove = useCallback(async (cartItemId) => {
    if (!userId) {
      const guest = readLocalCart().filter(g => g.product_id !== cartItemId);
      writeLocalCart(guest);
      setItems(guest.map(g => ({ ...g, cart_item_id: g.product_id })));
      return;
    }
    const sb = getSupabase();
    await sb.from('cart_items').delete().eq('id', cartItemId);
    await refresh();
  }, [userId, refresh]);

  const clear = useCallback(async () => {
    writeLocalCart([]);
    if (userId) {
      const sb = getSupabase();
      await sb.from('cart_items').delete().eq('user_id', userId);
    }
    setItems([]);
  }, [userId]);

  const count = items.reduce((s, i) => s + (i.quantity || 1), 0);
  const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);

  // ── Création de commande à partir du panier ─────────────────────
  // Transforme les cart_items du user connecté en une ligne `orders`
  // + ses `order_items`, et retourne l'order_id pour la page /paiement.
  // Nécessite un compte (pas de panier invité) — les prix sont relus
  // en base au moment de la commande, jamais depuis le state client.
  const createOrder = useCallback(async () => {
    if (!userId) return { success: false, error: 'not_authenticated' };
    const sb = getSupabase();
    const idempotencyKey = getOrCreateIdempotencyKey();

    // Si une tentative précédente avec la même clé a déjà abouti (retry après
    // coupure réseau, double clic...), on renvoie cette commande au lieu d'en
    // recréer une deuxième.
    if (idempotencyKey) {
      const { data: existing } = await sb.from('orders')
        .select('id').eq('user_id', userId).eq('idempotency_key', idempotencyKey).maybeSingle();
      if (existing) { clearIdempotencyKey(); return { success: true, orderId: existing.id }; }
    }

    const { data: cartRows, error: cartErr } = await sb.from('cart_items')
      .select('quantity, product_id, products(price, currency, stock, name, shop_id)')
      .eq('user_id', userId);
    if (cartErr) return { success: false, error: cartErr.message };
    if (!cartRows || cartRows.length === 0) return { success: false, error: 'empty_cart' };

    const outOfStock = cartRows.find((r) => r.products?.stock != null && r.products.stock < r.quantity);
    if (outOfStock) return { success: false, error: 'out_of_stock', product: outOfStock.products?.name };

    // Filet de sécurité : un panier ne devrait plus jamais mélanger deux
    // boutiques (bloqué dès l'ajout dans `add`), mais un panier créé avant
    // ce garde-fou pourrait encore en contenir un. Additionner des prix de
    // devises différentes donnerait un total n'importe quoi — on préfère
    // refuser plutôt que produire une commande fausse.
    const distinctShops = new Set(cartRows.map((r) => r.products?.shop_id).filter(Boolean));
    if (distinctShops.size > 1) return { success: false, error: 'mixed_shops' };

    const vendorCurrency = cartRows[0]?.products?.currency || 'MAD';
    const subtotalVendorCurrency = cartRows.reduce((s, r) => s + (r.products?.price || 0) * r.quantity, 0);

    // total_amount/currency restent dans la devise du VENDEUR — c'est ce que
    // lisent le tableau de bord vendeur, les commissions et les retraits.
    // Le montant réellement facturé à l'acheteur (converti, avec la marge de
    // sécurité anti-perte) est stocké à part, dans buyer_total_amount /
    // buyer_currency, et ne sert qu'à la page de paiement.
    const buyerCurrency = getBuyerCurrency();
    const conv = await convertPrice(subtotalVendorCurrency, vendorCurrency, buyerCurrency, sb);

    const { data: order, error: orderErr } = await sb.from('orders')
      .insert({
        user_id: userId, status: 'pending',
        subtotal: subtotalVendorCurrency, total_amount: subtotalVendorCurrency, currency: vendorCurrency,
        buyer_total_amount: conv.amount, buyer_currency: conv.currency,
        idempotency_key: idempotencyKey,
      })
      .select('id').single();

    if (orderErr) {
      // Code 23505 = violation de contrainte unique : une autre requête (même
      // clé) a créé la commande entre-temps. On la récupère au lieu d'échouer.
      if (orderErr.code === '23505' && idempotencyKey) {
        const { data: raced } = await sb.from('orders')
          .select('id').eq('user_id', userId).eq('idempotency_key', idempotencyKey).maybeSingle();
        if (raced) { clearIdempotencyKey(); return { success: true, orderId: raced.id }; }
      }
      return { success: false, error: orderErr.message };
    }
    if (!order) return { success: false, error: 'order_create_failed' };

    const itemsPayload = cartRows.map((r) => ({
      order_id: order.id, product_id: r.product_id, quantity: r.quantity, unit_price: r.products?.price || 0,
    }));
    const { error: itemsErr } = await sb.from('order_items').insert(itemsPayload);
    if (itemsErr) return { success: false, error: itemsErr.message };

    clearIdempotencyKey();
    return { success: true, orderId: order.id };
  }, [userId]);

  return (
    <CartContext.Provider value={{ items, count, subtotal, loading, add, updateQuantity, remove, clear, refresh, createOrder }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé à l\'intérieur de <CartProvider>');
  return ctx;
}
