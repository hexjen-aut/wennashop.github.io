/**
 * WennaShop — Offline Sync Manager
 * Synchronise les données locales avec Supabase quand la connexion revient
 * + Bannière statut réseau pour l'UI
 */

class WennaSyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.retryDelay = 5000; // 5s entre chaque tentative
    this.maxRetries = 3;

    this._bindEvents();
    this._injectStatusBanner();

    // Au démarrage, si online → vérifier s'il y a des données à sync
    if (this.isOnline) {
      setTimeout(() => this.syncAll(), 2000);
    }
  }

  // ─── ÉVÉNEMENTS RÉSEAU ────────────────────────────────────────────────────

  _bindEvents() {
    window.addEventListener('online', () => {
      console.log('[Sync] Connexion rétablie — synchronisation en cours...');
      this.isOnline = true;
      this._updateBanner('online');
      setTimeout(() => this.syncAll(), 1500); // Petit délai pour laisser la connexion se stabiliser
    });

    window.addEventListener('offline', () => {
      console.log('[Sync] Hors connexion — mode offline activé');
      this.isOnline = false;
      this._updateBanner('offline');
    });

    // Écouter les messages du Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_PENDING_ORDERS') {
          this.syncPendingOrders();
        }
        if (event.data.type === 'SYNC_PENDING_CART') {
          this.syncPendingCart();
        }
      });
    }
  }

  // ─── BANNIÈRE STATUT RÉSEAU ───────────────────────────────────────────────

  _injectStatusBanner() {
    const banner = document.createElement('div');
    banner.id = 'wenna-network-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 99999;
      padding: 10px 20px;
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      transform: translateY(-100%);
      transition: transform 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    `;
    document.body.prepend(banner);
    this.banner = banner;

    // Initialiser selon l'état actuel
    if (!this.isOnline) this._updateBanner('offline');
  }

  _updateBanner(status) {
    if (!this.banner) return;

    if (status === 'offline') {
      this.banner.style.background = '#FF6B2B';
      this.banner.style.color = '#fff';
      this.banner.innerHTML = `
        <span>⚠️</span>
        <span>Mode hors ligne — Vos achats sont sauvegardés et seront envoyés dès le retour de la connexion</span>
      `;
      this.banner.style.transform = 'translateY(0)';
    } else if (status === 'online') {
      this.banner.style.background = '#22c55e';
      this.banner.style.color = '#fff';
      this.banner.innerHTML = `
        <span>✅</span>
        <span>Connexion rétablie — Synchronisation en cours...</span>
      `;
      this.banner.style.transform = 'translateY(0)';
      // Masquer après 4 secondes
      setTimeout(() => {
        this.banner.style.transform = 'translateY(-100%)';
      }, 4000);
    } else if (status === 'syncing') {
      this.banner.style.background = '#3b82f6';
      this.banner.style.color = '#fff';
      this.banner.innerHTML = `
        <span>🔄</span>
        <span>Synchronisation des commandes en attente...</span>
      `;
      this.banner.style.transform = 'translateY(0)';
    }
  }

  // ─── SYNC PRINCIPALE ──────────────────────────────────────────────────────

  async syncAll() {
    if (this.syncInProgress || !this.isOnline) return;
    this.syncInProgress = true;

    try {
      const stats = await window.wennaDB.getOfflineStats();
      
      if (stats.pendingOrders > 0 || stats.syncQueue > 0) {
        this._updateBanner('syncing');
        await this.syncPendingOrders();
        await this.processSyncQueue();
      }

      // Rafraîchir le cache produits si stale
      if (await window.wennaDB.isCacheStale(30)) {
        await this.refreshProductsCache();
      }

    } catch (err) {
      console.error('[Sync] Erreur sync globale:', err);
    } finally {
      this.syncInProgress = false;
    }
  }

  // ─── SYNC COMMANDES PENDING ───────────────────────────────────────────────

  async syncPendingOrders() {
    if (!window.wennaDB || !window.db) return;

    const pending = await window.wennaDB.getPendingOrders();
    if (pending.length === 0) return;

    console.log(`[Sync] ${pending.length} commandes en attente à synchroniser`);

    for (const order of pending) {
      let attempt = 0;
      let success = false;

      while (attempt < this.maxRetries && !success) {
        try {
          // Attendre que window.db soit prêt
          await waitForDb();

          // Insérer la commande dans Supabase
          const { data, error } = await window.db
            .from('orders')
            .insert({
              buyer_id: order.buyer_id,
              seller_id: order.seller_id,
              total_amount: order.total_amount,
              items: order.items,
              payment_method: order.payment_method,
              shipping_address: order.shipping_address,
              status: 'pending',
              created_at: order.created_at,
            })
            .select()
            .single();

          if (error) throw error;

          // Marquer comme sync
          await window.wennaDB.markOrderSynced(order.local_id);
          success = true;

          console.log(`[Sync] Commande ${order.local_id} synchronisée → Supabase ID: ${data.id}`);

          // Notifier l'utilisateur
          this._showToast(`✅ Commande envoyée avec succès ! (réf. ${data.id.slice(0, 8)})`);

          // Vider le panier si c'était la dernière commande
          const remaining = await window.wennaDB.getPendingOrders();
          if (remaining.length === 0) {
            await window.wennaDB.clearCart();
          }

        } catch (err) {
          attempt++;
          console.warn(`[Sync] Tentative ${attempt}/${this.maxRetries} échouée pour commande ${order.local_id}:`, err);

          if (attempt < this.maxRetries) {
            await new Promise(r => setTimeout(r, this.retryDelay * attempt));
          } else {
            await window.wennaDB.markOrderFailed(order.local_id, err.message);
            console.error(`[Sync] Commande ${order.local_id} définitivement échouée`);
            this._showToast(`❌ Erreur envoi commande. Contactez le support.`, 'error');
          }
        }
      }
    }
  }

  // ─── QUEUE DE SYNC GÉNÉRIQUE ──────────────────────────────────────────────

  async processSyncQueue() {
    if (!window.wennaDB || !window.db) return;

    const queue = await window.wennaDB.getSyncQueue();
    if (queue.length === 0) return;

    console.log(`[Sync] ${queue.length} opérations en queue`);

    for (const operation of queue) {
      try {
        await waitForDb();
        let result;

        switch (operation.type) {
          case 'INSERT':
            result = await window.db.from(operation.table).insert(operation.data);
            break;
          case 'UPDATE':
            result = await window.db.from(operation.table).update(operation.data).eq('id', operation.id);
            break;
          case 'DELETE':
            result = await window.db.from(operation.table).delete().eq('id', operation.id);
            break;
          default:
            console.warn('[Sync] Type opération inconnu:', operation.type);
            continue;
        }

        if (result.error) throw result.error;

        await window.wennaDB.removeFromSyncQueue(operation.id);
        console.log(`[Sync] Opération ${operation.type} sur ${operation.table} exécutée`);

      } catch (err) {
        console.error(`[Sync] Erreur opération queue:`, err);
        // Incrémenter les retries
        operation.retries = (operation.retries || 0) + 1;
        if (operation.retries >= this.maxRetries) {
          await window.wennaDB.removeFromSyncQueue(operation.id);
        } else {
          await window.wennaDB._put('syncQueue', operation);
        }
      }
    }
  }

  // ─── REFRESH CACHE PRODUITS ───────────────────────────────────────────────

  async refreshProductsCache() {
    if (!this.isOnline || !window.db) return;

    try {
      await waitForDb();

      const { data: products, error } = await window.db
        .from('products')
        .select('id, name, price, image_url, category_id, seller_id, description, stock')
        .eq('status', 'active')
        .limit(200);

      if (error) throw error;
      if (products?.length) await window.wennaDB.cacheProducts(products);

      const { data: categories } = await window.db
        .from('categories')
        .select('*')
        .eq('is_active', true);

      if (categories?.length) await window.wennaDB.cacheCategories(categories);

      console.log(`[Sync] Cache produits rafraîchi: ${products?.length} produits, ${categories?.length} catégories`);

    } catch (err) {
      console.warn('[Sync] Impossible de rafraîchir le cache:', err);
    }
  }

  // ─── TOAST NOTIFICATIONS ──────────────────────────────────────────────────

  _showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const bg = type === 'error' ? '#ef4444' : type === 'info' ? '#3b82f6' : '#22c55e';
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: ${bg};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 99999;
      transition: transform 0.3s ease;
      max-width: 90vw;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(100px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────

  get online() { return this.isOnline; }

  /**
   * Wrapper pour les appels Supabase : 
   * Si online → appel direct
   * Si offline → sauvegarde en IndexedDB
   */
  async safeInsert(table, data, options = {}) {
    if (this.isOnline) {
      try {
        await waitForDb();
        return await window.db.from(table).insert(data);
      } catch (err) {
        // Si l'appel réseau échoue malgré la connexion
        console.warn('[Sync] Insert échoué malgré connexion, mise en queue:', err);
        await window.wennaDB.addToSyncQueue({ type: 'INSERT', table, data });
        return { data: null, error: null, offline: true };
      }
    } else {
      // Hors ligne : sauvegarder localement
      if (options.isOrder) {
        await window.wennaDB.savePendingOrder(data);
      } else {
        await window.wennaDB.addToSyncQueue({ type: 'INSERT', table, data });
      }
      return { data: null, error: null, offline: true };
    }
  }
}

// ─── Initialisation après chargement du DOM ───────────────────────────────
function initWennaSyncManager() {
  window.wennaSyncManager = new WennaSyncManager();
  console.log('[Sync] WennaSyncManager initialisé — État réseau:', navigator.onLine ? '🟢 Online' : '🔴 Offline');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWennaSyncManager);
} else {
  initWennaSyncManager();
}
