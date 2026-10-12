// src/lib/whiteBackground.js
//
// Photos produits sur fond blanc. On regarde une bande sur les bords de
// l'image : si elle est presque entièrement blanche, le fond est blanc.
// Sinon, le fond est remplacé par du blanc côté serveur (fonction
// remove-background, Photoroom) quand le service est configuré.

export const WHITE_BG_KEY = 'product_white_bg_required';

const BORDER = 0.04; // 4 % de la largeur / hauteur sur chaque bord
const MIN_CHANNEL = 235; // R, G et B au moins à ce niveau
const MAX_SPREAD = 18; // écart max entre canaux (exclut les crèmes, gris colorés)
const MIN_RATIO = 0.85; // part minimale de pixels blancs sur le bord
const SAMPLE_SIZE = 200; // l'image est réduite à 200 px de côté avant l'analyse

// Analyse des pixels RGBA d'une image width × height. Exportée pour les tests.
export function borderWhiteRatio(data, width, height) {
  const bx = Math.max(1, Math.round(width * BORDER));
  const by = Math.max(1, Math.round(height * BORDER));
  let white = 0;
  let total = 0;
  for (let y = 0; y < height; y++) {
    const onEdgeRow = y < by || y >= height - by;
    for (let x = 0; x < width; x++) {
      if (!onEdgeRow && x >= bx && x < width - bx) continue;
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      total++;
      // Pixel transparent (PNG détouré) : compté comme blanc, il sera aplati sur blanc
      if (a < 16) { white++; continue; }
      if (r >= MIN_CHANNEL && g >= MIN_CHANNEL && b >= MIN_CHANNEL
        && Math.max(r, g, b) - Math.min(r, g, b) <= MAX_SPREAD) white++;
    }
  }
  return total ? white / total : 0;
}

async function loadBitmap(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// { ok, ratio } — ok si le bord est blanc à au moins 85 %
export async function checkWhiteBackground(blob) {
  const bmp = await loadBitmap(blob);
  const scale = Math.min(1, SAMPLE_SIZE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const ratio = borderWhiteRatio(ctx.getImageData(0, 0, w, h).data, w, h);
  return { ok: ratio >= MIN_RATIO, ratio };
}

// Remplace le fond par du blanc (Photoroom, via la fonction remove-background).
// Retourne un Blob JPEG, ou lève une erreur avec un message lisible.
export async function whitenBackground(sb, blob) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Connecte-toi pour ajouter des photos.');
  const form = new FormData();
  form.append('image_file', blob, 'photo.jpg');
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/remove-background`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    body: form,
  });
  if (!res.ok) {
    let message = '';
    try { message = (await res.json())?.error || ''; } catch {}
    throw new Error(message || 'Le détourage automatique est indisponible.');
  }
  return res.blob();
}
