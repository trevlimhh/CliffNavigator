// Persists a full HouseholdProfile the user has already explicitly confirmed — no diffing, no
// eligibility recomputation, just save. Originally built for the "Tell us what's changed" flow
// (only called after the user says yes to "update my profile with this?" — see
// SituationUpdateCard.tsx), and reused as-is by SchemeOverviewSection's quick "mark as rejected" /
// "remove rejection" actions (see DashboardClient.tsx's handleQuickProfileUpdate) — a click on
// either of those IS the explicit confirmation, same trust level as the situation-update yes/no.
// Deliberately does NOT create a notification here: notifications are reserved for renewal-due/
// overdue reminders from the scheduled check (see /api/notifications/check), not for eligibility
// changes the user just saw and acted on themselves in the same session — putting it in the bell
// too would just be repeating something they already read.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProfile, saveProfile } from "@/lib/profileRepository";
import type { HouseholdProfile } from "@/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { newProfile?: HouseholdProfile };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { newProfile } = body;
  if (!newProfile) return NextResponse.json({ error: "newProfile is required." }, { status: 400 });

  const existingProfile = await loadProfile(supabase, user.id);
  if (!existingProfile) return NextResponse.json({ error: "No existing profile — complete onboarding first." }, { status: 400 });

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("email_notifications_enabled, notification_email")
    .eq("id", user.id)
    .maybeSingle();

  await saveProfile(supabase, user.id, newProfile, {
    emailNotificationsEnabled: profileRow?.email_notifications_enabled ?? false,
    notificationEmail: profileRow?.notification_email ?? null,
  });

  return NextResponse.json({ ok: true });
}
