import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadNotificationSettings, loadProfile } from "@/lib/profileRepository";
import { isSupabaseConfigured } from "@/lib/supabaseConfigured";
import { ProfilePageClient } from "@/components/ProfilePageClient";

export default async function ProfilePage() {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await loadProfile(supabase, user.id);
  if (!profile) redirect("/onboarding");

  const notificationSettings = await loadNotificationSettings(supabase, user.id);

  return (
    <ProfilePageClient
      initialProfile={profile}
      emailNotificationsEnabled={notificationSettings.emailNotificationsEnabled}
      notificationEmail={notificationSettings.notificationEmail}
    />
  );
}
