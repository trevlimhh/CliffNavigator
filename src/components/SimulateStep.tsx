"use client";

import { useState } from "react";
import { schemes } from "@data/schemes";
import { CliffResultPanel } from "./CliffResultPanel";
import type { ExplanationResult } from "@/services/explanation";
import type { HouseholdProfile, ProfileChange, SimulationResult } from "@/types";
import { getErrorMessage } from "@/lib/getErrorMessage";

interface SimulateStepProps {
  profile: HouseholdProfile;
  changeHint?: string;
  onNext: () => void;
}

export function SimulateStep({ profile, changeHint, onNext }: SimulateStepProps) {
  const [mode, setMode] = useState<"income" | "expiry">("income");
  const [newIncome, setNewIncome] = useState(Math.round(profile.grossHouseholdMonthlyIncome * 0.7));
  const [expirySchemeId, setExpirySchemeId] = useState(profile.enrolledSchemes[0]?.schemeId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ source: "live" | "mock"; simulation: SimulationResult; explanation: ExplanationResult } | null>(null);

  const enrolledOptions = profile.enrolledSchemes.map((e) => ({
    id: e.schemeId,
    name: schemes.find((s) => s.id === e.schemeId)?.name ?? e.schemeId,
  }));

  function buildChange(): { change: ProfileChange; changeDescription: string } | null {
    if (mode === "income") {
      return { change: { type: "income_change", newGrossHouseholdMonthlyIncome: newIncome }, changeDescription: `Household income changes to $${newIncome}/month` };
    }
    if (!expirySchemeId) return null;
    const name = schemes.find((s) => s.id === expirySchemeId)?.name ?? expirySchemeId;
    return { change: { type: "scheme_expiry", schemeId: expirySchemeId }, changeDescription: `${name} ends / is not renewed` };
  }

  async function handleSimulate() {
    const built = buildChange();
    if (!built) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, change: built.change, changeDescription: built.changeDescription }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setOutcome({ source: body.source, simulation: body.simulation, explanation: body.explanation });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Simulate a change</h2>
        <p className="mt-1 text-sm text-slate-600">See what happens to your support before it happens.</p>
        {changeHint && <p className="mt-1 text-xs text-slate-500">You mentioned: "{changeHint}" — try modeling that below.</p>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setMode("income")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === "income" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          Income changes
        </button>
        <button
          onClick={() => setMode("expiry")}
          disabled={enrolledOptions.length === 0}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === "expiry" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          A scheme ends
        </button>
      </div>

      {mode === "income" ? (
        <label className="block text-sm">
          <span className="text-slate-700">New gross household monthly income ($)</span>
          <input
            type="number"
            className="mt-1 w-full rounded border border-slate-300 p-2"
            value={newIncome}
            onChange={(e) => setNewIncome(Number(e.target.value))}
          />
          <span className="mt-1 block text-xs text-slate-500">Currently ${profile.grossHouseholdMonthlyIncome}/month</span>
        </label>
      ) : (
        <label className="block text-sm">
          <span className="text-slate-700">Which scheme ends?</span>
          <select className="mt-1 w-full rounded border border-slate-300 p-2" value={expirySchemeId} onChange={(e) => setExpirySchemeId(e.target.value)}>
            {enrolledOptions.length === 0 && <option value="">No enrolled schemes to end</option>}
            {enrolledOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        onClick={handleSimulate}
        disabled={loading}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loading ? "Simulating…" : "Simulate this change"}
      </button>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {outcome && (
        <>
          <CliffResultPanel simulation={outcome.simulation} explanation={outcome.explanation} source={outcome.source} />
          <button onClick={onNext} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500">
            Generate handoff summary →
          </button>
        </>
      )}
    </div>
  );
}
