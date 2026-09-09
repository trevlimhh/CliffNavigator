"use client";

import { ProfileEditor } from "./ProfileEditor";
import { createClient } from "@/lib/supabase/client";
import { saveProfile } from "@/lib/profileRepository";
import type { HouseholdProfile } from "@/types";

interface ProfilePageClientProps {
  initialProfile: HouseholdProfile;
  emailNotificationsEnabled: boolean;
  notificationEmail: string | null;
}

export function ProfilePageClient({ initialProfile, emailNotificationsEnabled, notificationEmail }: ProfilePageClientProps) {
  async function handleSave(profile: HouseholdProfile) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");
    await saveProfile(supabase, user.id, profile, { emailNotificationsEnabled, notificationEmail });
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Your profile</h1>
          <div className="flex items-center gap-3 text-sm">
            <a href="/settings" className="text-slate-500 underline hover:text-slate-700">
              Account settings
            </a>
            <a href="/dashboard" className="text-slate-500 underline hover:text-slate-700">
              ← Back to dashboard
            </a>
          </div>
        </div>
        <ProfileEditor initialProfile={initialProfile} onSave={handleSave} saveLabel="Save changes" />
      </div>
    </main>
  );
}
