// Envoie une notification WennaShop sur tous les appareils où l'utilisateur a
// activé les notifications (Web Push). Appelée par le trigger
// trg_send_notification_push à chaque nouvelle ligne de notifications.
//
// Pas de secret d'appel : la fonction ne fait que relire une notification déjà
// en base et ne l'envoie qu'une fois (push_sent_at), comme send-notification-email.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Clé publique : la même que VAPID_PUBLIC_KEY côté site (src/lib/push.js).
const VAPID_PUBLIC_KEY = "BGcJKoCMWrrIOJ7w6VLC-91ZWIgJ9wzftlxNbs5lX5KOSkTxtW2aFlrxg9LYFxrp13IoiJJHw6W4l6vt_KQ7HVI";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
let vapidReady = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  try {
    const { notification_id } = await req.json();
    if (!notification_id) return json({ error: "notification_id manquant" }, 400);

    const { data: notif } = await supabase
      .from("notifications")
      .select("id, user_id, type, title, body, link, push_sent_at")
      .eq("id", notification_id)
      .maybeSingle();
    if (!notif) return json({ error: "Notification introuvable" }, 404);
    if (notif.push_sent_at) return json({ skipped: "already_sent" });

    // On marque avant d'envoyer : deux appels simultanés n'envoient qu'une fois.
    const { data: claimed } = await supabase
      .from("notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", notif.id)
      .is("push_sent_at", null)
      .select("id");
    if (!claimed?.length) return json({ skipped: "already_sent" });

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", notif.user_id);
    if (!subs?.length) return json({ skipped: "no_device" });

    if (!vapidReady) {
      const { data: privateKey, error } = await supabase.rpc("get_vapid_private_key");
      if (error || !privateKey) return json({ error: "Clé VAPID absente" }, 500);
      webpush.setVapidDetails("mailto:contact@wennashop.com", VAPID_PUBLIC_KEY, privateKey);
      vapidReady = true;
    }

    const payload = JSON.stringify({
      title: notif.title,
      body: notif.body || "",
      link: notif.link || "/",
      tag: notif.id,
    });

    const sent: string[] = [];
    const gone: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24, urgency: notif.type === "money" || notif.type === "order" ? "high" : "normal" },
        );
        sent.push(s.id);
      } catch (e) {
        // 404/410 : l'appareil a retiré l'autorisation ou l'abonnement a expiré.
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id);
      }
    }));

    if (gone.length) await supabase.from("push_subscriptions").delete().in("id", gone);
    if (sent.length) {
      await supabase.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", sent);
    }

    return json({ sent: sent.length, removed: gone.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
