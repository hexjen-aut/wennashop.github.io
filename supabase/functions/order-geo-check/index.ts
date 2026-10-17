import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Contrôle du pays d'une commande (anti-fraude), appelé par /paiement juste
// après submit_checkout. Écrit dans order_geo_checks avec la clé de service :
// le navigateur ne peut ni écrire ni lire ce résultat, seuls les agents le
// voient (fiche du paiement).
//
// Corps : { order_id, display_country, country_source: 'auto'|'manual',
//           ip_country_hint, device: { status: 'granted'|'denied'|'unavailable', lat, lng, accuracy } }
// - Pays de l'appareil : calculé ici à partir de la position (contours
//   simplifiés du Gabon et du Maroc, tolérance de ~40 km pour les côtes et
//   les frontières), jamais pris tel quel du navigateur.
// - Pays de la connexion : en-tête du réseau quand il existe, sinon l'indice
//   donné par le site (détection Vercel à l'ouverture), marqué comme tel.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_ORIGIN = /^https:\/\/(www\.)?wennashop\.com$|^https:\/\/wennashop-github-io-[a-z0-9-]+\.vercel\.app$/;

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN.test(origin) ? origin : "https://wennashop.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

// Contours simplifiés [lng, lat] (Natural Earth 1:110m ; Maroc = Maroc + provinces du Sud).
const SHAPES: Record<string, number[][][]> = {"Gabon":[[[11.09,-3.98],[10.07,-2.97],[9.41,-2.14],[8.8,-1.11],[8.83,-0.78],[9.05,-0.46],[9.29,0.27],[9.49,1.01],[9.83,1.07],[11.29,1.06],[11.28,2.26],[11.75,2.33],[12.36,2.19],[12.95,2.32],[13.08,2.27],[13.0,1.83],[13.28,1.31],[14.03,1.4],[14.28,1.2],[13.84,0.04],[14.32,-0.55],[14.43,-1.33],[14.3,-2.0],[13.99,-2.47],[13.11,-2.43],[12.58,-1.95],[12.5,-2.39],[11.82,-2.51],[11.48,-2.77],[11.86,-3.43],[11.09,-3.98]]],"Maroc":[[[-5.19,35.76],[-4.59,35.33],[-3.64,35.4],[-2.6,35.18],[-2.17,35.17],[-1.79,34.53],[-1.73,33.92],[-1.39,32.86],[-1.12,32.65],[-1.31,32.26],[-2.62,32.09],[-3.07,31.72],[-3.65,31.64],[-3.69,30.9],[-4.86,30.5],[-5.24,30.0],[-6.06,29.73],[-7.06,29.58],[-8.67,28.84],[-8.67,27.66],[-8.82,27.66],[-8.82,27.66],[-8.79,27.12],[-9.41,27.09],[-9.74,26.86],[-10.19,26.86],[-10.55,26.99],[-11.39,26.88],[-11.72,26.1],[-12.03,26.03],[-12.5,24.77],[-13.89,23.69],[-14.22,22.31],[-14.63,21.86],[-14.75,21.5],[-17.0,21.42],[-17.02,21.42],[-16.97,21.89],[-16.59,22.16],[-16.26,22.68],[-16.33,23.02],[-15.98,23.72],[-15.43,24.36],[-15.09,24.52],[-14.82,25.1],[-14.8,25.64],[-14.44,26.25],[-13.77,26.62],[-13.14,27.64],[-13.12,27.65],[-12.62,28.04],[-11.69,28.15],[-10.9,28.83],[-10.4,29.1],[-9.56,29.93],[-9.81,31.18],[-9.43,32.04],[-9.3,32.56],[-8.66,33.24],[-7.65,33.7],[-6.91,34.11],[-6.24,35.15],[-5.93,35.76],[-5.19,35.76]],[[-8.79,27.12],[-8.82,27.66],[-8.67,27.66],[-8.67,27.59],[-8.68,27.4],[-8.69,25.88],[-11.97,25.93],[-11.94,23.37],[-12.87,23.28],[-13.12,22.77],[-12.93,21.33],[-16.85,21.33],[-17.06,21.0],[-17.02,21.42],[-17.0,21.42],[-14.75,21.5],[-14.63,21.86],[-14.22,22.31],[-13.89,23.69],[-12.5,24.77],[-12.03,26.03],[-11.72,26.1],[-11.39,26.88],[-10.55,26.99],[-10.19,26.86],[-9.74,26.86],[-9.41,27.09],[-8.79,27.12]]]};

const TOLERANCE_KM = 40;

// Codes ISO renvoyés par le réseau → noms utilisés dans la base (src/lib/geo.js).
const ISO_TO_NAME: Record<string, string> = {
  MA: "Maroc", GA: "Gabon", SN: "Sénégal", CI: "Côte d'Ivoire", CM: "Cameroun", CG: "Congo",
  CD: "RD Congo", BJ: "Bénin", TG: "Togo", ML: "Mali", BF: "Burkina Faso", GN: "Guinée",
  DZ: "Algérie", TN: "Tunisie", NE: "Niger", TD: "Tchad", MR: "Mauritanie", MG: "Madagascar",
  KM: "Comores", DJ: "Djibouti", CF: "Centrafrique", FR: "France", ES: "Espagne", BE: "Belgique",
  US: "États-Unis", CA: "Canada",
};

function inRing(lng: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Distance approximative (km) d'un point au contour le plus proche.
function distanceKm(lng: number, lat: number, ring: number[][]) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57;
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = ring[i][0] * kx, ay = ring[i][1] * ky, bx = ring[i + 1][0] * kx, by = ring[i + 1][1] * ky;
    const px = lng * kx, py = lat * ky;
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

function countryAt(lat: number, lng: number): string {
  for (const [name, rings] of Object.entries(SHAPES)) {
    if (rings.some((r) => inRing(lng, lat, r))) return name;
  }
  for (const [name, rings] of Object.entries(SHAPES)) {
    if (rings.some((r) => distanceKm(lng, lat, r) <= TOLERANCE_KM)) return name;
  }
  return "Autre";
}

type Device = { status?: string; lat?: unknown; lng?: unknown; accuracy?: unknown };

// Verdict du contrôle, sans effet de bord (testable à part).
export function evaluate(a: { delivery: string | null; displayCountry: string | null; source: string | null; ipCountry: string | null; device: Device }) {
  const lat = Number(a.device.lat), lng = Number(a.device.lng);
  const hasPos = a.device.status === "granted" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const deviceCountry = hasPos ? countryAt(lat, lng) : null;
  const deviceStatus = hasPos
    ? (deviceCountry === a.delivery ? "match" : "mismatch")
    : (a.device.status === "denied" ? "denied" : "unavailable");

  const reasons: string[] = [];
  if (deviceStatus === "mismatch") reasons.push("device_country_differs");
  if (deviceStatus === "denied") reasons.push("device_position_refused");
  if (a.ipCountry && a.delivery && a.ipCountry !== a.delivery && deviceStatus !== "match") reasons.push("ip_country_differs");
  if (a.source === "manual" && a.displayCountry && a.ipCountry && a.displayCountry !== a.ipCountry) reasons.push("country_changed_by_visitor");
  // Un changement de pays par le visiteur est noté ; il ne déclenche une
  // vérification que si la position de l'appareil ne confirme pas la livraison.
  const risk = reasons.some((r) => r !== "country_changed_by_visitor" || deviceStatus !== "match") ? "a_verifier" : "ok";

  return {
    device_status: deviceStatus,
    device_country: deviceCountry,
    device_lat: hasPos ? Math.round(lat * 100) / 100 : null,
    device_lng: hasPos ? Math.round(lng * 100) / 100 : null,
    device_accuracy_m: hasPos && Number.isFinite(Number(a.device.accuracy)) ? Math.round(Number(a.device.accuracy)) : null,
    risk,
    reasons,
  };
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "unauthenticated" }, 401);
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: authData } = await caller.auth.getUser(jwt);
    if (!authData?.user) return json({ error: "unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "invalid_order" }, 400);

    const { data: me } = await admin.from("users").select("id").eq("auth_id", authData.user.id).maybeSingle();
    const { data: order } = await admin.from("orders").select("id, user_id, shipping_country").eq("id", orderId).maybeSingle();
    if (!me || !order || order.user_id !== me.id) return json({ error: "not_found" }, 404);

    const delivery = order.shipping_country || null;
    const displayCountry = typeof body.display_country === "string" ? body.display_country.slice(0, 40) : null;
    const source = body.country_source === "manual" ? "manual" : body.country_source === "auto" ? "auto" : null;

    const netIso = (req.headers.get("cf-ipcountry") || req.headers.get("x-country-code") || "").toUpperCase();
    const hintIso = String(body.ip_country_hint || "").toUpperCase().slice(0, 2);
    const ipIso = /^[A-Z]{2}$/.test(netIso) && netIso !== "XX" ? netIso : (/^[A-Z]{2}$/.test(hintIso) ? hintIso : "");
    const ipCountry = ipIso ? (ISO_TO_NAME[ipIso] || ipIso) : null;
    // Journal sans donnée personnelle : d'où vient le pays de la connexion.
    console.log(JSON.stringify({ ip_country_from: ipIso === netIso && ipIso ? "network" : ipIso ? "site_hint" : "none" }));

    const v = evaluate({ delivery, displayCountry, source, ipCountry, device: body.device || {} });

    const row = {
      order_id: orderId,
      user_id: me.id,
      delivery_country: delivery,
      display_country: displayCountry,
      country_source: source,
      ip_country: ipCountry,
      ...v,
    };
    const { error } = await admin.from("order_geo_checks").upsert(row, { onConflict: "order_id" });
    if (error) return json({ error: "save_failed" }, 500);

    // Le navigateur ne reçoit que l'accusé de réception, pas le verdict.
    return json({ ok: true });
  } catch (_e) {
    return json({ error: "server_error" }, 500);
  }
});
