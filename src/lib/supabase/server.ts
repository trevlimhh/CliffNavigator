// Server-side Supabase client for Server Components / Route Handlers / Server Actions — reads
// and writes the auth session via Next's cookie store. Still uses the anon key (RLS-scoped);
// see admin.ts for the service_role client used only by trusted, non-user-scoped operations.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Copy .env.example to .env and fill them in.");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component that can't set cookies — middleware.ts refreshes the
          // session on every request instead, so this is safe to ignore.
        }
      },
    },
  });
}
