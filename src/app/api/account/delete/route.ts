// Permanently deletes the signed-in user's account. Uses the admin (service_role) client because
// Supabase's client SDK has no self-service "delete my own auth account" call — only
// auth.admin.deleteUser(), which requires the service role and must never run in the browser.
// Deleting the auth.users row cascades to profiles (and from there to household_members,
// enrolled_schemes, eligibility_snapshots, notifications, push_subscriptions — every table's FK
// is "on delete cascade"), so this one call is enough to remove everything.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
