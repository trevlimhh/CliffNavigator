"use client";

import { useState } from "react";
import { ProfileEditor } from "@/components/ProfileEditor";
import { SchemeOverviewSection } from "@/components/SchemeOverviewSection";
import { SimulateStep } from "@/components/SimulateStep";
import { HandoffStep } from "@/components/HandoffStep";
import type { HouseholdProfile } from "@/types";

type Step = "profile" | "eligibility" | "simulate" | "handoff";

const STEPS: { id: Step; label: string }[] = [
  { id: "profile", label: "1. Your profile" },
  { id: "eligibility", label: "2. Your schemes" },
  { id: "simulate", label: "3. Simulate a change" },
  { id: "handoff", label: "4. Handoff summary" },
];

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-4 text-sm text-slate-500 underline hover:text-slate-700">
      ← Back
    </button>
  );
}

export default function DemoPage() {
  const [step, setStep] = useState<Step>("profile");
  const [profile, setProfile] = useState<HouseholdProfile | null>(null);

  const currentIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-center text-xs text-slate-500">
          No-login walkthrough — nothing here is saved. <a href="/login" className="underline">Sign in</a> to save your profile and get renewal/eligibility notifications.
        </div>
        <h1 className="text-center text-2xl font-bold text-slate-900">Benefit Cliff Navigator</h1>
        <p className="mt-1 text-center text-sm text-slate-500">For Singapore family caregivers — see how a change affects your support.</p>

        <nav className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                i === currentIndex ? "bg-slate-900 text-white" : i < currentIndex ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
              }`}
            >
              {s.label}
            </span>
          ))}
        </nav>

        <div className="mt-8">
          {step === "profile" && (
            <ProfileEditor
              initialProfile={profile}
              saveLabel="Continue"
              onSave={async (p) => {
                setProfile(p);
                setStep("eligibility");
              }}
            />
          )}

          {step === "eligibility" && profile && (
            <div className="mx-auto max-w-2xl">
              <BackButton onClick={() => setStep("profile")} />
              <SchemeOverviewSection profile={profile} onProfileUpdated={setProfile} />
              <button
                onClick={() => setStep("simulate")}
                className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
              >
                Simulate a change →
              </button>
            </div>
          )}

          {step === "simulate" && profile && (
            <div>
              <div className="mx-auto max-w-2xl">
                <BackButton onClick={() => setStep("eligibility")} />
              </div>
              <SimulateStep profile={profile} onNext={() => setStep("handoff")} />
            </div>
          )}

          {step === "handoff" && profile && (
            <div>
              <div className="mx-auto max-w-2xl">
                <BackButton onClick={() => setStep("simulate")} />
              </div>
              <HandoffStep profile={profile} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
