// Notifications push (Web Push) : la notification arrive sur l'appareil même
// quand WennaShop est fermé. L'envoi se fait côté Supabase (fonction send-push,
// déclenchée à chaque nouvelle ligne de notifications) ; ici on gère seulement
// l'autorisation et l'abonnement de l'appareil.
import { getSupabase } from '@/lib/supabase';

// Clé publique VAPID (pas un secret) : la même que dans supabase/functions/send-push.
export const VAPID_PUBLIC_KEY = 'BGcJKoCMWrrIOJ7w6VLC-91ZWIgJ9wzftlxNbs5lX5KOSkTxtW2aFlrxg9LYFxrp13IoiJJHw6W4l6vt_KQ7HVI';

function base64UrlToBytes(value) {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// 'unsupported' | 'ios-install' (iPhone : il faut d'abord ajouter le site à
// l'écran d'accueil) | 'denied' | 'granted' | 'default'
export function pushSupport() {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

async function registration() {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (pushSupport() !== 'granted') return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }));
  const { endpoint, keys } = sub.toJSON();
  const { error } = await getSupabase().rpc('save_push_subscription', {
    p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_user_agent: navigator.userAgent,
  });
  if (error) return { ok: false, reason: 'save_failed' };
  return { ok: true };
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await getSupabase().rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

// L'abonnement d'un appareil peut changer (renouvellement par le navigateur,
// autre compte connecté) : on le réenregistre pour le compte actuel.
export async function syncPushSubscription() {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  const { endpoint, keys } = sub.toJSON();
  await getSupabase().rpc('save_push_subscription', {
    p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_user_agent: navigator.userAgent,
  });
}
