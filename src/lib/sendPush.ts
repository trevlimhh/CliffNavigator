// Server-side Web Push sender. Mirrors src/lib/email.ts's pattern: if VAPID keys aren't
// configured, it no-ops (logs and returns) rather than throwing, since push is one of two
// optional notification channels, not a hard requirement.

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export async function sendPushToProfile(supabase: SupabaseClient, profileId: string, title: string, body: string): Promise<{ sent: number }> {
  if (!ensureVapidConfigured()) {
    console.log(`[push skipped — VAPID not configured] Would have sent to profile ${profileId}: "${title}"`);
    return { sent: 0 };
  }

  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").eq("profile_id", profileId);
  if (!subscriptions || subscriptions.length === 0) return { sent: 0 };

  const payload = JSON.stringify({ title, body });
  let sent = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription expired or was revoked by the browser — clean it up rather than retrying forever.
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("Failed to send push notification:", err);
      }
    }
  }

  return { sent };
}
