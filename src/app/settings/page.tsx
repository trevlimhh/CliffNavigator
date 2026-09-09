import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadNotificationSettings } from "@/lib/profileRepository";
import { isSupabaseConfigured } from "@/lib/supabaseConfigured";
import { SettingsPageClient } from "@/components/SettingsPageClient";

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const notificationSettings = await loadNotificationSettings(supabase, user.id);

  return <SettingsPageClient email={user.email ?? ""} initialSettings={notificationSettings} />;
}
