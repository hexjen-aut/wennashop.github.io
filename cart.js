/**
 * WennaShop — cart.js
 * Gestion du panier 100% Supabase.
 * Inclure ce fichier APRÈS le SDK Supabase sur chaque page qui touche le panier.
 *
 * Usage :
 *   await Cart.add(productId, productName, price, imageUrl, currency)
 *   await Cart.count()         → nombre total d'articles
 *   Cart.updateBadge(badgeId)  → met à jour un badge DOM
 */

const Cart = (() => {
  const SUPABASE_URL  = 'https://aakxoydznmybstfozjte.supabase.co'
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3hveWR6bm15YnN0Zm96anRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDQxMjAsImV4cCI6MjA5MTE4MDEyMH0.ncjxAvqVrxW75QJ4zcu0StOJsNtEZfY1SD48nRyJCs0'

  // Réutiliser l'instance globale si déjà créée (évite doublons)
  const sb = window._wennaSb
    || (window._wennaSb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON))

  // Cache userId pour éviter des appels répétés
  let _userId = null

  /**
   * Résoudre l'id interne de l'utilisateur connecté.
   * Retourne null si non connecté.
   */
  async function getUserId() {
    if (_userId) return _userId

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return null

    // Chercher par auth_id
    let { data: profile } = await sb
      .from('users').select('id').eq('auth_id', user.id).maybeSingle()

    // Fallback email + correction auth_id
    if (!profile) {
      const { data: byEmail } = await sb
        .from('users').select('id').ilike('email', user.email).maybeSingle()
      if (byEmail) {
        profile = byEmail
        await sb.from('users').update({ auth_id: user.id }).eq('id', profile.id)
      }
    }

    if (!profile) return null
    _userId = profile.id
    return _userId
  }

  /**
   * Ajouter un produit au panier (ou incrémenter la quantité).
   * Retourne { success, error, message }
   */
  async function add(productId, productName, price, imageUrl, currency) {
    const userId = await getUserId()
    if (!userId) {
      return { success: false, error: 'not_logged_in', message: 'Connecte-toi pour ajouter au panier.' }
    }

    // Vérifier si l'item existe déjà
    const { data: existing } = await sb
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle()

    let error
    if (existing) {
      // Incrémenter
      ;({ error } = await sb
        .from('cart_items')
        .update({ quantity: existing.quantity + 1 })
        .eq('id', existing.id))
    } else {
      // Insérer
      ;({ error } = await sb
        .from('cart_items')
        .insert({
          user_id:    userId,
          product_id: productId,
          quantity:   1,
          added_at:   new Date().toISOString()
        }))
    }

    if (error) {
      console.error('[Cart.add] Supabase error:', error)
      return { success: false, error: error.message, message: 'Erreur lors de l\'ajout.' }
    }

    return { success: true, message: `« ${productName} » ajouté au panier` }
  }

  /**
   * Compter le total d'articles dans le panier de l'utilisateur.
   */
  async function count() {
    const userId = await getUserId()
    if (!userId) return 0

    const { data } = await sb
      .from('cart_items')
      .select('quantity')
      .eq('user_id', userId)

    return (data || []).reduce((s, i) => s + (i.quantity || 1), 0)
  }

  /**
   * Mettre à jour un ou plusieurs badges DOM avec le vrai count.
   * @param  {...string} badgeIds  IDs des éléments DOM à mettre à jour
   */
  async function updateBadge(...badgeIds) {
    const n = await count()
    badgeIds.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      el.textContent = n > 99 ? '99+' : n
      if (n > 0) { el.classList.remove('hidden'); el.classList.add('flex') }
      else        { el.classList.add('hidden');    el.classList.remove('flex') }
    })
    return n
  }

  return { add, count, updateBadge, getUserId }
})()
