"use client";

import { useState } from "react";
import { schemes } from "@data/schemes";
import { evaluateAllSchemes } from "@/engine";
import { formatHandoffSummary } from "@/lib/formatHandoffSummary";
import type { HouseholdProfile } from "@/types";

interface HandoffStepProps {
  profile: HouseholdProfile;
}

export function HandoffStep({ profile }: HandoffStepProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    const eligibility = evaluateAllSchemes(profile, schemes);
    setSummary(formatHandoffSummary(profile, eligibility));
    setCopied(false);
  }

  async function handleCopy() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Handoff summary</h2>
        <p className="mt-1 text-sm text-slate-600">
          A shareable summary of the household's situation and current schemes — for a warm handoff to a caseworker or another agency.
        </p>
      </div>

      <button onClick={handleGenerate} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700">
        Generate handoff summary
      </button>

      {summary && (
        <div className="space-y-2">
          <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-800 shadow-sm">{summary}</pre>
          <button onClick={handleCopy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500">
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
        </div>
      )}
    </div>
  );
}
