"use client";

import { useState } from "react";
import { NotificationBell } from "./NotificationBell";
import { SchemeOverviewSection } from "./SchemeOverviewSection";
import { SituationUpdateCard } from "./SituationUpdateCard";
import { HandoffStep } from "./HandoffStep";
import { getErrorMessage } from "@/lib/getErrorMessage";
import type { HouseholdProfile } from "@/types";

interface NotificationRow {
  id: string;
  type: string;
  headline: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

interface DashboardClientProps {
  initialProfile: HouseholdProfile;
  initialNotifications: NotificationRow[];
}

export function DashboardClient({ initialProfile, initialNotifications }: DashboardClientProps) {
  const [profile, setProfile] = useState<HouseholdProfile>(initialProfile);
  const [quickUpdateError, setQuickUpdateError] = useState<string | null>(null);

  // Persists a quick action (mark rejected / remove rejection) from SchemeOverviewSection without
  // a trip through the full profile editor. Reuses /api/situation/confirm — it already does
  // exactly this ("persist this full profile the user just confirmed"), and this click is itself
  // the confirmation, same as the "Tell us what's changed" flow's explicit yes/no step.
  async function handleQuickProfileUpdate(newProfile: HouseholdProfile) {
    setProfile(newProfile);
    setQuickUpdateError(null);
    try {
      const res = await fetch("/api/situation/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newProfile }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
    } catch (err) {
      setProfile(profile); // revert the optimistic update — the save didn't actually go through
      setQuickUpdateError(getErrorMessage(err));
    }
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Benefit Cliff Navigator</h1>
            <p className="text-xs text-slate-500">Your dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/profile" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">
              Profile
            </a>
            <a href="/settings" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">
              Settings
            </a>
            <NotificationBell initialNotifications={initialNotifications} />
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <div className="space-y-10">
          {quickUpdateError && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Couldn't save that: {quickUpdateError}</p>}
          <SchemeOverviewSection profile={profile} onProfileUpdated={handleQuickProfileUpdate} />
          <SituationUpdateCard profile={profile} onProfileUpdated={setProfile} />
          <HandoffStep profile={profile} />
        </div>
      </div>
    </main>
  );
}
