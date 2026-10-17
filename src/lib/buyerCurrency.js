import { currencyForCountry } from './currency';

// Même clé que celle utilisée par le sélecteur de pays sur /boutique — lire
// cette valeur ici permet à la devise d'affichage de suivre automatiquement
// le pays choisi par l'acheteur, sur toutes les pages du site.
export const BUYER_COUNTRY_KEY = 'wenna_buyer_country';
// 'auto' = pays déduit de la connexion ; 'manual' = choisi par le visiteur.
export const COUNTRY_SOURCE_KEY = 'wenna_country_source';
// Code pays de la connexion (ex. MA, GA), relu à chaque visite via /api/geo.
export const IP_COUNTRY_KEY = 'wenna_ip_country';

// Lecture sans risque du stockage du navigateur (navigation privée, etc.).
export function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export function getBuyerCurrency() {
  if (typeof window === 'undefined') return 'MAD';
  try {
    const country = localStorage.getItem(BUYER_COUNTRY_KEY);
    return currencyForCountry(country) || 'MAD';
  } catch {
    return 'MAD';
  }
}

// Position de l'appareil au moment de payer, pour le contrôle anti-fraude
// (fonction order-geo-check). Ne bloque jamais : refus, absence ou délai
// dépassé donnent simplement un statut.
export function getDevicePosition(timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve({ status: 'unavailable' }); return; }
    const timer = setTimeout(() => resolve({ status: 'unavailable' }), timeoutMs + 1000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(timer); resolve({ status: 'granted', lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
      (e) => { clearTimeout(timer); resolve({ status: e && e.code === 1 ? 'denied' : 'unavailable' }); },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}
