import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateNotificationSettings, type NotificationSettings } from "@/lib/profileRepository";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Partial<NotificationSettings>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.emailNotificationsEnabled !== "boolean" || typeof body.pushNotificationsEnabled !== "boolean") {
    return NextResponse.json({ error: "emailNotificationsEnabled and pushNotificationsEnabled are required booleans." }, { status: 400 });
  }

  try {
    await updateNotificationSettings(supabase, user.id, {
      emailNotificationsEnabled: body.emailNotificationsEnabled,
      notificationEmail: body.notificationEmail ?? null,
      pushNotificationsEnabled: body.pushNotificationsEnabled,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save notification settings." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
