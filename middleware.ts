// Redirect-only auth gate: sends logged-out visitors to /login and logged-in visitors away from
// /login, based on the mere PRESENCE of a Supabase session cookie — no signature/expiry
// validation happens here. That's deliberate, not a security gap: the actual security boundary is
// every page/route handler's own supabase.auth.getUser() call (via src/lib/supabase/server.ts),
// which always re-validates against Supabase regardless of what middleware decided. Middleware is
// UX only — worst case a stale/forged cookie skips a redirect, and the page/route underneath
// still enforces real auth.
//
// Deliberately has ZERO third-party dependencies (no @supabase/ssr, no createServerClient) so it
// can run on the Edge runtime, which this app's middleware must — this Next.js/Vercel combination
// does not support Node.js-runtime middleware (every attempt to declare `runtime: "nodejs"`, via
// either the config object or a top-level export, was silently ignored: middleware disappeared
// from the build entirely with no warning). The previous version called
// @supabase/ssr's createServerClient()/getUser() here to also proactively refresh the session
// cookie — that pulled in supabase-js's bundled Realtime/`ws` client, which is not Edge-compatible
// and crashed every request in production with `ReferenceError: __dirname is not defined`. The
// browser-side Supabase client (src/lib/supabase/client.ts) still auto-refreshes tokens on its
// own timer regardless, so this only gives up "refresh on every server-rendered navigation too" —
// a real but survivable trade-off against the alternative of middleware not working at all.
// /demo stays open with no login, as a no-persistence walkthrough of the whole flow.

import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/demo", "/login", "/signup", "/auth"];

function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token/.test(c.name));
}

export function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No Supabase configured yet — don't block the app, just skip auth gating so /demo etc. still work.
  if (!url || !anonKey) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const isLoggedIn = hasSupabaseSessionCookie(request);

  if (!isLoggedIn && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (isLoggedIn && (path.startsWith("/login") || path.startsWith("/signup"))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  runtime: "edge",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/intake|api/simulate).*)"],
};
