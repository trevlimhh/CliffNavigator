"use client";

import { useState } from "react";
import { FieldWrapper } from "./FieldWrapper";
import { YesNoField } from "./YesNoField";
import { CliffResultPanel } from "./CliffResultPanel";
import type { ExplanationResult } from "@/services/explanation";
import type { HouseholdProfile, HousingType, SimulationResult } from "@/types";
import type { IntakeExtractionResult } from "@/services/intakeExtraction";
import { getErrorMessage } from "@/lib/getErrorMessage";

interface SituationUpdateCardProps {
  profile: HouseholdProfile;
  onProfileUpdated: (profile: HouseholdProfile) => void;
}

type HouseholdFields = Pick<HouseholdProfile, "grossHouseholdMonthlyIncome" | "housingType" | "annualValueOfHome" | "propertyCount" | "hasCertifiedCareNeed">;

type SaveState = "idle" | "saving" | "saved" | "declined";

export function SituationUpdateCard({ profile, onProfileUpdated }: SituationUpdateCardProps) {
  const [freeText, setFreeText] = useState("");
  const [draft, setDraft] = useState<HouseholdFields | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ source: "live" | "mock"; simulation: SimulationResult; explanation: ExplanationResult } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  function reset() {
    setFreeText("");
    setDraft(null);
    setResult(null);
    setSaveState("idle");
    setSaveError(null);
  }

  async function handleAnalyze() {
    if (!freeText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSaveState("idle");
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");

      const extraction: IntakeExtractionResult = body.result;
      // Merge: only override fields the extraction actually found something for; everything else
      // keeps its current stored value, since a "what's changed" note is usually about one thing.
      setDraft({
        grossHouseholdMonthlyIncome: extraction.extracted.grossHouseholdMonthlyIncome ?? profile.grossHouseholdMonthlyIncome,
        housingType: extraction.extracted.housingType ?? profile.housingType,
        annualValueOfHome: extraction.extracted.annualValueOfHome ?? profile.annualValueOfHome,
        propertyCount: extraction.extracted.propertyCount ?? profile.propertyCount,
        hasCertifiedCareNeed: extraction.extracted.hasCertifiedCareNeed ?? profile.hasCertifiedCareNeed,
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      const newProfile: HouseholdProfile = { ...profile, ...draft };
      const res = await fetch("/api/situation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newProfile, changeDescription: freeText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setResult({ source: body.source, simulation: body.simulation, explanation: body.explanation });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmSave() {
    if (!draft) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const newProfile: HouseholdProfile = { ...profile, ...draft };
      const res = await fetch("/api/situation/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newProfile }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      onProfileUpdated(newProfile);
      setSaveState("saved");
    } catch (err) {
      setSaveError(getErrorMessage(err));
      setSaveState("idle");
    }
  }

  function handleDecline() {
    setSaveState("declined");
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Tell us what's changed</h2>
        <p className="mt-1 text-sm text-slate-600">
          Describe anything new about your situation — a change in income, a new job, a move, or a change in the care needs of who you look after.
          We'll check what it might mean for your support <strong>before</strong> anything is saved to your profile.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          For example: "I just started a part-time job earning $800 a month", "My mother now needs help with daily activities", or "We moved to a
          smaller flat."
        </p>
      </div>

      <div className="space-y-2">
        <textarea
          className="w-full rounded-lg border border-slate-300 p-3 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
          rows={3}
          placeholder="e.g. I just started a part-time job earning $800 a month"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
        />
        <button
          onClick={handleAnalyze}
          disabled={loading || !freeText.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "Checking…" : "See what changed"}
        </button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {draft && !result && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Confirm these details before we check your eligibility — nothing is saved to your profile yet:</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldWrapper
              label="Total household monthly income ($)"
              helpText="Add up everyone's pay before tax/CPF deductions — salary, wages, allowances. If no one earns anything, enter 0."
            >
              <input
                type="number"
                className="w-full rounded border border-slate-300 p-1.5 text-sm"
                value={draft.grossHouseholdMonthlyIncome}
                onChange={(e) => setDraft({ ...draft, grossHouseholdMonthlyIncome: Number(e.target.value) })}
              />
            </FieldWrapper>
            <FieldWrapper label="What type of home do you live in?">
              <select
                className="w-full rounded border border-slate-300 p-1.5 text-sm"
                value={draft.housingType}
                onChange={(e) => setDraft({ ...draft, housingType: e.target.value as HousingType })}
              >
                <option value="hdb_1_2_room">HDB 1- or 2-room flat</option>
                <option value="hdb_3_room">HDB 3-room flat</option>
                <option value="hdb_4_room">HDB 4-room flat</option>
                <option value="hdb_5_room_or_exec">HDB 5-room or executive flat</option>
                <option value="private_property">Private property (condo, landed, etc.)</option>
              </select>
            </FieldWrapper>
            <FieldWrapper
              label="Annual Value (AV) of your home ($)"
              helpText={'A government valuation used for tax purposes — NOT your home\'s market price. Free to look up at "IRAS myTax Portal" → View Property Portfolio.'}
            >
              <input
                type="number"
                className="w-full rounded border border-slate-300 p-1.5 text-sm"
                value={draft.annualValueOfHome}
                onChange={(e) => setDraft({ ...draft, annualValueOfHome: Number(e.target.value) })}
              />
            </FieldWrapper>
            <FieldWrapper
              label="Properties you (and your spouse) own"
              helpText="Count homes or other residential property owned, anywhere in the world. Most renters/HDB owners should enter 1."
            >
              <input
                type="number"
                className="w-full rounded border border-slate-300 p-1.5 text-sm"
                value={draft.propertyCount}
                onChange={(e) => setDraft({ ...draft, propertyCount: Number(e.target.value) })}
              />
            </FieldWrapper>
            <YesNoField
              label="Does anyone in your household have a certified care need?"
              helpText='This means a doctor or an official assessor has confirmed someone needs regular help with everyday activities — eating, bathing, dressing, moving around, toileting, or getting in/out of bed/chairs (called "Activities of Daily Living"). Simply being elderly, or having a minor/temporary health issue, does not count on its own — it needs to be a formal assessment.'
              value={draft.hasCertifiedCareNeed}
              onChange={(v) => setDraft({ ...draft, hasCertifiedCareNeed: v })}
            />
          </div>
          <button
            onClick={handlePreview}
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:bg-slate-300"
          >
            {loading ? "Checking…" : "Check eligibility (preview only)"}
          </button>
        </div>
      )}

      {result && (
        <>
          <CliffResultPanel simulation={result.simulation} explanation={result.explanation} source={result.source} />

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            {saveState === "idle" && (
              <>
                <p className="text-sm font-medium text-slate-800">Update your profile with this information?</p>
                <p className="mt-1 text-xs text-slate-500">This hasn't been saved yet — nothing changes until you confirm.</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={handleConfirmSave} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
                    Yes, update my profile
                  </button>
                  <button onClick={handleDecline} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300">
                    No, don't save
                  </button>
                </div>
                {saveError && <p className="mt-2 text-sm text-rose-600">{saveError}</p>}
              </>
            )}
            {saveState === "saving" && <p className="text-sm text-slate-600">Saving…</p>}
            {saveState === "saved" && (
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-700">✓ Your profile has been updated.</p>
                <button onClick={reset} className="text-xs text-slate-500 underline hover:text-slate-700">
                  Describe another change
                </button>
              </div>
            )}
            {saveState === "declined" && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">No changes were saved. Your profile is unchanged.</p>
                <button onClick={reset} className="text-xs text-slate-500 underline hover:text-slate-700">
                  Try again
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
