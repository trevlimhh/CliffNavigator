import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasCompletedOnboarding } from "@/lib/profileRepository";
import { isSupabaseConfigured } from "@/lib/supabaseConfigured";

export default async function RootPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-bold text-slate-900">Benefit Cliff Navigator</h1>
          <p className="text-sm text-slate-600">
            Supabase isn't configured yet, so login and saved profiles aren't available. Copy <code>.env.example</code> to <code>.env</code> and
            fill in the Supabase keys — or try the walkthrough below with nothing saved.
          </p>
          <a href="/demo" className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700">
            Open the no-login demo
          </a>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const onboarded = await hasCompletedOnboarding(supabase, user.id);
  redirect(onboarded ? "/dashboard" : "/onboarding");
}
