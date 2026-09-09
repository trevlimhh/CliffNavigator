// Scheduled notification check — meant to be called on a cron schedule (see
// supabase/functions/check-notifications/ for the trigger), but can also be called manually
// (e.g. a "check now" button) since it's idempotent-ish: it only inserts a notification for a
// renewal it hasn't already recorded.
//
// Deliberately renewal-only: eligibility gains/losses are already surfaced synchronously in the UI
// (SchemeOverviewSection, SituationUpdateCard) the moment a user causes them, so putting the same
// event in the persistent notification bell would just repeat something they already saw. The bell
// is reserved for things that need reminding about over time — an upcoming or overdue renewal.
//
// Protected by a shared secret (CRON_SECRET) rather than user auth, since this runs across every
// user's data — that's exactly what the service-role admin client is for.

import { NextResponse } from "next/server";
import { schemes } from "@data/schemes";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProfile } from "@/lib/profileRepository";
import { detectRenewalNotifications, type NotificationDraft } from "@/lib/notificationEngine";
import { sendNotificationEmail } from "@/lib/email";
import { sendPushToProfile } from "@/lib/sendPush";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("x-cron-secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: profileRows, error } = await supabase
    .from("profiles")
    .select("id, email_notifications_enabled, notification_email, push_notifications_enabled");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary: { profileId: string; notificationsCreated: number }[] = [];

  for (const profileRow of profileRows ?? []) {
    const profile = await loadProfile(supabase, profileRow.id);
    if (!profile) continue;

    const drafts: NotificationDraft[] = detectRenewalNotifications(profile, schemes);

    let created = 0;
    for (const draft of drafts) {
      // Avoid re-notifying for the same still-unresolved renewal/status every single run: skip if
      // an unread notification of this exact type+scheme already exists for this profile.
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("profile_id", profileRow.id)
        .eq("type", draft.type)
        .eq("scheme_id", draft.schemeId)
        .is("read_at", null)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      let channel: "in_app" | "email" | "push" = "in_app";
      if (profileRow.email_notifications_enabled && profileRow.notification_email) {
        const { sent } = await sendNotificationEmail(profileRow.notification_email, draft.headline, draft.message);
        if (sent) channel = "email";
      }
      if (profileRow.push_notifications_enabled) {
        const { sent } = await sendPushToProfile(supabase, profileRow.id, draft.headline, draft.message);
        if (sent > 0) channel = "push";
      }

      const { error: insertError } = await supabase.from("notifications").insert({
        profile_id: profileRow.id,
        type: draft.type,
        scheme_id: draft.schemeId,
        headline: draft.headline,
        message: draft.message,
        channel,
      });
      if (!insertError) created += 1;
    }

    summary.push({ profileId: profileRow.id, notificationsCreated: created });
  }

  return NextResponse.json({ checked: summary.length, summary });
}
