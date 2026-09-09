"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileEditor } from "@/components/ProfileEditor";
import { createClient } from "@/lib/supabase/client";
import { saveProfile } from "@/lib/profileRepository";
import type { HouseholdProfile } from "@/types";
import { getErrorMessage } from "@/lib/getErrorMessage";

type Step = "profile" | "notifications";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("profile");
  const [profile, setProfile] = useState<HouseholdProfile | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      setAuthEmail(email);
      setNotificationEmail(email);
    });
  }, []);

  async function handleProfileSaved(p: HouseholdProfile) {
    setProfile(p);
    setStep("notifications");
  }

  async function handleFinish() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      await saveProfile(supabase, user.id, profile, {
        emailNotificationsEnabled,
        notificationEmail: emailNotificationsEnabled ? notificationEmail || null : null,
        markOnboardingComplete: true,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-center text-2xl font-bold text-slate-900">Welcome — let's set up your profile</h1>
        <p className="mt-1 text-center text-sm text-slate-500">This only takes a minute, and you can update it any time from your dashboard.</p>

        <div className="mt-8">
          {/* initialProfile={profile}, not null — otherwise clicking "Back" from the notifications
              step below remounts ProfileEditor with an empty draft, wiping out everything already entered. */}
          {step === "profile" && <ProfileEditor initialProfile={profile} onSave={handleProfileSaved} saveLabel="Continue" />}

          {step === "notifications" && profile && (
            <div className="mx-auto max-w-md space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Stay on top of renewals and eligibility changes</h2>
              <p className="text-sm text-slate-600">
                We'll check your schemes' renewal dates and let you know if your eligibility changes — for example, if a grant is about to lapse, or
                you newly qualify for something. You can also turn on push notifications later from Account Settings.
              </p>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={emailNotificationsEnabled}
                  onChange={(e) => setEmailNotificationsEnabled(e.target.checked)}
                />
                Email me about renewals and eligibility changes
              </label>

              {emailNotificationsEnabled && (
                <label className="block text-sm">
                  <span className="text-slate-700">Email for notifications</span>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    placeholder={authEmail}
                  />
                </label>
              )}

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep("profile")} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                  Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:bg-slate-300"
                >
                  {saving ? "Saving…" : "Finish setup"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
