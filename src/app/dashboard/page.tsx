import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/profileRepository";
import { isSupabaseConfigured } from "@/lib/supabaseConfigured";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await loadProfile(supabase, user.id);
  if (!profile) redirect("/onboarding");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return <DashboardClient initialProfile={profile} initialNotifications={notifications ?? []} />;
}
