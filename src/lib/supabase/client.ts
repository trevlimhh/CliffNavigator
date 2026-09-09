// Browser-side Supabase client — safe to use in "use client" components. Uses the public anon
// key only (RLS enforces per-user access), never the service_role key.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Copy .env.example to .env and fill them in.");
  }
  return createBrowserClient(url, anonKey);
}
