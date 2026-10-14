import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Suppression de compte demandée par l'utilisateur (Mon compte → Supprimer).
//
// Le profil (public.users) est relié au compte de connexion par auth_id,
// pas par id. Ce que promet la politique de confidentialité :
// - identité effacée : nom, e-mail, téléphone, adresse, pièce d'identité,
//   coordonnées de versement, photo ;
// - boutique et produits retirés du site ;
// - connexion impossible ;
// - commandes, paiements et reversements conservés (obligations comptables),
//   sans lien vers la personne.
// Le compte de connexion est supprimé quand rien ne s'y oppose ; s'il reste
// lié à des ventes (boutique avec commandes, retraits), il est vidé et bloqué.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_ORIGINS = new Set(["https://wennashop.com", "https://www.wennashop.com"]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://wennashop.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Supprime tous les fichiers d'un dossier (un niveau) d'un bucket
async function removeFolder(bucket: string, folder: string) {
  const { data } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  const paths = (data || []).filter((f) => f.name).map((f) => `${folder}/${f.name}`);
  if (paths.length) await admin.storage.from(bucket).remove(paths);
}

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "Non authentifié" }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await callerClient.auth.getUser(jwt);
    if (authErr || !authData?.user) return json({ error: "Session invalide" }, 401);
    const authId = authData.user.id;

    const { data: profile } = await admin
      .from("users")
      .select("id, role, email")
      .eq("auth_id", authId)
      .maybeSingle();
    if (!profile) return json({ error: "Profil introuvable" }, 404);
    if (profile.role === "admin") return json({ error: "Un compte administrateur ne se supprime pas depuis le site." }, 403);

    // Un retrait en cours doit d'abord être traité par l'équipe
    const { count: openPayouts } = await admin
      .from("payouts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .in("status", ["PENDING", "APPROVED"]);
    if (openPayouts) {
      return json({ error: "Un retrait est en cours : contacte support@wennashop.com pour clôturer ton compte." }, 409);
    }

    // Boutique et produits retirés du site
    await admin.from("products").update({ status: "inactive" }).eq("seller_id", profile.id);
    await admin.from("shops").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("user_id", profile.id);
    await admin.from("shop_members").delete().eq("user_id", profile.id);
    await admin.from("staff_roles").delete().eq("user_id", profile.id);

    // Fichiers personnels : pièce d'identité et photo
    await removeFolder("kyc-documents", authId);
    await removeFolder("avatars", profile.id);

    // Profil anonymisé (les commandes y restent rattachées)
    const tombstone = `deleted_${Date.now()}_${profile.id}@deleted.wennashop.com`;
    const { error: anonErr } = await admin.from("users").update({
      status: "deleted",
      email: tombstone,
      full_name: "Compte supprimé",
      first_name: null,
      last_name: null,
      phone: null,
      city: null,
      address: null,
      avatar_url: null,
      id_card_front_url: null,
      id_card_back_url: null,
      document_type: null,
      hunter_payout_method: null,
      hunter_payout_details: null,
      hunter_status: null,
      hunter_referral_code: null,
      deletion_requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", profile.id);
    if (anonErr) return json({ error: "Échec de la fermeture du compte", detail: anonErr.message }, 500);

    // Les paiements restent (liés à leur commande), sans lien vers la personne
    await admin.from("payments").update({ user_id: null }).eq("user_id", profile.id);

    // Compte de connexion : supprimé si possible, sinon vidé et bloqué
    const { error: deleteErr } = await admin.auth.admin.deleteUser(authId);
    if (deleteErr) {
      const { error: banErr } = await admin.auth.admin.updateUserById(authId, {
        email: tombstone,
        password: crypto.randomUUID() + crypto.randomUUID(),
        user_metadata: {},
        ban_duration: "876000h",
      });
      if (banErr) return json({ error: "Échec de la fermeture du compte", detail: banErr.message }, 500);
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
