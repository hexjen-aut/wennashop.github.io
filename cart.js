/* ═══════════════════════════════════════════════════════════
   WENNASHOP — js/cart.js
   Gestion panier : Supabase (auth) + localStorage (guest)
   API exposée : window.Cart
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict'

  /* ── CONFIG ── */
  const LOCAL_KEY = 'wenna_cart_guest'

  /* ── HELPERS SUPABASE ── */
  function getDb() { return window.db || null }

  async function getCurrentUser() {
    const db = getDb(); if (!db) return null
    try {
      const { data: { user } } = await db.auth.getUser()
      return user || null
    } catch { return null }
  }

  async function getUserRow(authId) {
    const db = getDb(); if (!db) return null
    try {
      const { data } = await db.from('users').select('id').eq('auth_id', authId).single()
      return data || null
    } catch { return null }
  }

  /* ── LOCAL STORAGE (guest) ── */
  function localGet() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') } catch { return [] }
  }
  function localSet(items) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)) } catch {}
  }
  function localAdd(productId, name, price, imageUrl, currency) {
    const items = localGet()
    const existing = items.find(i => i.product_id === productId)
    if (existing) { existing.quantity += 1 }
    else { items.push({ product_id: productId, name, price, image_url: imageUrl, currency: currency || 'MAD', quantity: 1 }) }
    localSet(items)
  }
  function localRemove(productId) {
    localSet(localGet().filter(i => i.product_id !== productId))
  }
  function localClear() { localSet([]) }
  function localCount() { return localGet().reduce((s, i) => s + (i.quantity || 1), 0) }

  /* ── SUPABASE CART ── */
  async function dbAdd(userId, productId, quantity = 1) {
    const db = getDb(); if (!db) return { error: 'no_db' }
    // Vérifier si déjà dans le panier
    const { data: existing } = await db
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle()

    if (existing) {
      const { error } = await db
        .from('cart_items')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id)
      return { error }
    } else {
      const { error } = await db
        .from('cart_items')
        .insert({ user_id: userId, product_id: productId, quantity })
      return { error }
    }
  }

  async function dbRemove(userId, productId) {
    const db = getDb(); if (!db) return
    await db.from('cart_items').delete().eq('user_id', userId).eq('product_id', productId)
  }

  async function dbCount(userId) {
    const db = getDb(); if (!db) return 0
    try {
      const { data } = await db.from('cart_items').select('quantity').eq('user_id', userId)
      return (data || []).reduce((s, r) => s + (r.quantity || 1), 0)
    } catch { return 0 }
  }

  async function dbItems(userId) {
    const db = getDb(); if (!db) return []
    try {
      const { data } = await db
        .from('cart_items')
        .select('id, quantity, product_id, products(id, name, price, currency, image_url, images, stock)')
        .eq('user_id', userId)
      return data || []
    } catch { return [] }
  }

  async function dbClear(userId) {
    const db = getDb(); if (!db) return
    await db.from('cart_items').delete().eq('user_id', userId)
  }

  /* ── MIGRATION guest → db ── */
  async function migrateGuestCart(userId) {
    const items = localGet()
    if (!items.length) return
    for (const item of items) {
      await dbAdd(userId, item.product_id, item.quantity || 1)
    }
    localClear()
  }

  /* ═══════════════════════════════════════════
     API PUBLIQUE : window.Cart
  ═══════════════════════════════════════════ */
  const Cart = {

    /**
     * Ajouter un produit au panier
     * @returns { success, error, message }
     */
    async add(productId, name, price, imageUrl, currency) {
      if (!productId) return { success: false, error: 'invalid_product', message: 'Produit invalide' }

      const user = await getCurrentUser()

      if (!user) {
        // Guest → localStorage
        localAdd(productId, name, price, imageUrl, currency)
        return { success: true, source: 'local' }
      }

      const userRow = await getUserRow(user.id)
      if (!userRow) {
        // Auth mais pas encore dans users → fallback local
        localAdd(productId, name, price, imageUrl, currency)
        return { success: true, source: 'local' }
      }

      // Migrer le panier guest si nécessaire
      await migrateGuestCart(userRow.id)

      const { error } = await dbAdd(userRow.id, productId)
      if (error) return { success: false, error: error.message || error, message: 'Erreur panier' }
      return { success: true, source: 'db' }
    },

    /**
     * Supprimer un produit du panier
     */
    async remove(productId) {
      const user = await getCurrentUser()
      if (!user) { localRemove(productId); return }
      const userRow = await getUserRow(user.id)
      if (!userRow) { localRemove(productId); return }
      await dbRemove(userRow.id, productId)
    },

    /**
     * Vider le panier
     */
    async clear() {
      const user = await getCurrentUser()
      localClear()
      if (!user) return
      const userRow = await getUserRow(user.id)
      if (userRow) await dbClear(userRow.id)
    },

    /**
     * Récupérer tous les articles
     * @returns Array
     */
    async getItems() {
      const user = await getCurrentUser()
      if (!user) return localGet()
      const userRow = await getUserRow(user.id)
      if (!userRow) return localGet()
      const items = await dbItems(userRow.id)
      // Normaliser le format
      return items.map(i => ({
        product_id: i.product_id,
        name:       i.products?.name || '—',
        price:      i.products?.price || 0,
        currency:   i.products?.currency || 'MAD',
        image_url:  Array.isArray(i.products?.images) && i.products.images.length
                      ? i.products.images[0]
                      : (i.products?.image_url || null),
        quantity:   i.quantity || 1,
        stock:      i.products?.stock ?? null,
        cart_item_id: i.id
      }))
    },

    /**
     * Nombre total d'articles
     * @returns number
     */
    async count() {
      const user = await getCurrentUser()
      if (!user) return localCount()
      const userRow = await getUserRow(user.id)
      if (!userRow) return localCount()
      return await dbCount(userRow.id)
    },

    /**
     * Mettre à jour le badge panier dans le DOM
     * @param {string} badgeId — id de l'élément badge
     */
    async updateBadge(badgeId = 'cart-badge') {
      const badge = document.getElementById(badgeId)
      if (!badge) return
      try {
        const total = await Cart.count()
        if (total > 0) {
          badge.textContent = total > 99 ? '99+' : total
          badge.classList.add('show')
        } else {
          badge.textContent = ''
          badge.classList.remove('show')
        }
      } catch { /* silencieux */ }
    },

    /**
     * Calculer le total prix
     * @returns { total, currency }
     */
    async getTotal() {
      const items = await Cart.getItems()
      const total = items.reduce((s, i) => s + (Number(i.price) * (i.quantity || 1)), 0)
      const currency = items[0]?.currency || 'MAD'
      return { total, currency }
    }
  }

  /* ── EXPOSER GLOBALEMENT ── */
  window.Cart = Cart

  /* ── AUTO-UPDATE BADGE AU CHARGEMENT ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Cart.updateBadge('cart-badge'))
  } else {
    Cart.updateBadge('cart-badge')
  }

})()
