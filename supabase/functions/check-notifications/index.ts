// Supabase Edge Function — a thin cron trigger, nothing more. It deliberately does NOT
// reimplement any eligibility/renewal logic in Deno; it just calls the Next.js app's own
// /api/notifications/check route (which uses the same src/engine.ts as everything else) over
// HTTP, authenticated with a shared secret. This keeps the rules engine in exactly one place.
//
// Deploy with the Supabase CLI:
//   supabase functions deploy check-notifications
//   supabase secrets set APP_URL=https://your-deployed-app.example.com CRON_SECRET=<same value as in .env>
// Then schedule it (Supabase Dashboard → Edge Functions → check-notifications → Cron, e.g. daily
// at 08:00) or via `supabase functions schedule`.

Deno.serve(async () => {
  const appUrl = Deno.env.get("APP_URL");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!appUrl) {
    return new Response(JSON.stringify({ error: "APP_URL secret not set" }), { status: 500 });
  }

  const response = await fetch(`${appUrl}/api/notifications/check`, {
    method: "POST",
    headers: cronSecret ? { "x-cron-secret": cronSecret } : {},
  });

  const body = await response.text();
  return new Response(body, { status: response.status, headers: { "Content-Type": "application/json" } });
});
