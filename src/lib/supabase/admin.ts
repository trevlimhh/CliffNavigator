// Service-role Supabase client — bypasses Row Level Security entirely. Only ever import this
// from trusted server-side code that legitimately needs to operate across all users' data (e.g.
// the notification-check route in src/app/api/notifications/check/route.ts). NEVER import this
// from a "use client" component or anything that ships to the browser — the service_role key
// grants full database access with no per-user restriction.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Copy .env.example to .env and fill them in.");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
