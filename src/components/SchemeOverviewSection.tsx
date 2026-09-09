"use client";

import { useState } from "react";
import { schemes } from "@data/schemes";
import { evaluateAllSchemes, getRenewalStatuses, getReportedAmount } from "@/engine";
import { SchemeStatusChart } from "./SchemeStatusChart";
import type { EligibilityResult, HouseholdProfile } from "@/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SchemeOverviewSectionProps {
  profile: HouseholdProfile;
  /**
   * When provided, enables inline "mark as rejected" / "remove rejection" actions directly from
   * this view, rather than requiring a trip to the full profile editor. Omit to render read-only
   * (e.g. a context with no way to persist a change).
   */
  onProfileUpdated?: (profile: HouseholdProfile) => void;
}

interface SuggestionBanner {
  tone: "action" | "supported" | "none";
  headline: string;
  detail: string;
}

function buildSuggestionBanner(current: EligibilityResult[], notYetApplied: EligibilityResult[]): SuggestionBanner {
  if (notYetApplied.length > 0) {
    const confirmed = notYetApplied.filter((r) => r.status === "eligible");
    const needsAssessment = notYetApplied.filter((r) => r.status === "possibly_eligible_requires_assessment");
    const parts: string[] = [];
    if (confirmed.length > 0) parts.push(`${confirmed.length} you likely qualify for`);
    if (needsAssessment.length > 0) parts.push(`${needsAssessment.length} that need an assessment first`);
    return {
      tone: "action",
      headline: `You could be getting more support — ${notYetApplied.length} scheme${notYetApplied.length === 1 ? "" : "s"} you haven't told us you're on.`,
      detail: `That's ${parts.join(" and ")}. See below for details and how to apply.`,
    };
  }
  if (current.length > 0) {
    return {
      tone: "supported",
      headline: "You're fully supported based on your situation.",
      detail: "You're already enrolled in every scheme we track that you appear eligible for. We'll let you know here if that changes.",
    };
  }
  return {
    tone: "none",
    headline: "You don't currently qualify for any of the schemes we track.",
    detail: "That's based on your profile as it stands — update it any time your situation changes and we'll check again.",
  };
}

const BANNER_STYLES: Record<SuggestionBanner["tone"], string> = {
  action: "border-blue-200 bg-blue-50 text-blue-900",
  supported: "border-emerald-200 bg-emerald-50 text-emerald-900",
  none: "border-slate-200 bg-slate-50 text-slate-700",
};

export function SchemeOverviewSection({ profile, onProfileUpdated }: SchemeOverviewSectionProps) {
  const [rejectFormOpenFor, setRejectFormOpenFor] = useState<string | null>(null);
  const [rejectNoteDraft, setRejectNoteDraft] = useState("");

  const results = evaluateAllSchemes(profile, schemes);
  const enrolledById = new Map(profile.enrolledSchemes.map((e) => [e.schemeId, e]));
  const rejectedSchemes = profile.rejectedSchemes ?? [];
  const rejectedIds = new Set(rejectedSchemes.map((r) => r.schemeId));

  const renewals = getRenewalStatuses(profile, schemes);

  const current = results.filter((r) => enrolledById.has(r.scheme.id));
  // Schemes already rejected are excluded from "you may be eligible for" — recommending an
  // application the household already tried and was turned down for would read as tone-deaf.
  // They get their own section below instead.
  const notYetApplied = results.filter((r) => !enrolledById.has(r.scheme.id) && !rejectedIds.has(r.scheme.id) && r.status !== "ineligible");
  const rejectedResults = results.filter((r) => rejectedIds.has(r.scheme.id));
  const banner = buildSuggestionBanner(current, notYetApplied);

  function confirmReject(schemeId: string) {
    if (!onProfileUpdated) return;
    onProfileUpdated({
      ...profile,
      rejectedSchemes: [...rejectedSchemes, { schemeId, rejectedDate: todayIso(), note: rejectNoteDraft.trim() || undefined }],
    });
    setRejectFormOpenFor(null);
    setRejectNoteDraft("");
  }

  function removeRejection(schemeId: string) {
    if (!onProfileUpdated) return;
    onProfileUpdated({ ...profile, rejectedSchemes: rejectedSchemes.filter((r) => r.schemeId !== schemeId) });
  }

  return (
    <div className="space-y-8">
      <SchemeStatusChart profile={profile} />

      <div className={`rounded-xl border p-4 ${BANNER_STYLES[banner.tone]}`}>
        <p className="font-semibold">{banner.headline}</p>
        <p className="mt-1 text-sm opacity-90">{banner.detail}</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Your current schemes</h2>
        {current.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">You haven't marked any schemes as enrolled yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {current.map((r) => {
              const renewal = renewals.find((rn) => rn.schemeId === r.scheme.id);
              const enrolled = enrolledById.get(r.scheme.id);
              const reported = getReportedAmount(r, enrolled);
              const isSelfReported = enrolled?.actualAmount !== undefined;
              return (
                <div key={r.scheme.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{r.scheme.name}</span>
                    <span className="text-sm text-slate-600">
                      {reported !== null ? (
                        <>
                          {isSelfReported ? "" : "~"}${reported}/{r.scheme.benefit.frequency}
                          {isSelfReported && r.estimatedBenefitAmount !== null && r.estimatedBenefitAmount !== reported && (
                            <span className="ml-1 text-xs text-slate-400">(est. up to ${r.estimatedBenefitAmount})</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                  {renewal?.daysUntilRenewal !== null && renewal?.daysUntilRenewal !== undefined && renewal.daysUntilRenewal <= 30 && (
                    <p className={`mt-1 text-xs font-medium ${renewal.daysUntilRenewal < 0 ? "text-rose-600" : "text-amber-600"}`}>
                      {renewal.daysUntilRenewal < 0
                        ? `Renewal overdue since ${renewal.nextRenewalDate}`
                        : `Renewal due ${renewal.nextRenewalDate} (in ${renewal.daysUntilRenewal} days)`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">You may be eligible for</h2>
        <p className="mt-1 text-sm text-slate-600">Based on your profile, but you haven't told us you're on these yet.</p>
        {notYetApplied.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing new right now — check back after updating your situation.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {notYetApplied.map((r) => (
              <div key={r.scheme.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{r.scheme.name}</span>
                  {r.status === "possibly_eligible_requires_assessment" && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">Needs assessment</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-700">{r.scheme.description}</p>
                <p className="mt-1 text-sm font-medium text-emerald-800">
                  {r.estimatedBenefitAmount !== null ? `Estimated ~$${r.estimatedBenefitAmount}/${r.scheme.benefit.frequency}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href={r.scheme.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                  >
                    Apply →
                  </a>
                  {onProfileUpdated &&
                    (rejectFormOpenFor === r.scheme.id ? null : (
                      <button
                        onClick={() => {
                          setRejectFormOpenFor(r.scheme.id);
                          setRejectNoteDraft("");
                        }}
                        className="text-xs text-slate-500 underline hover:text-slate-700"
                      >
                        Already applied and got turned down?
                      </button>
                    ))}
                </div>
                {onProfileUpdated && rejectFormOpenFor === r.scheme.id && (
                  <div className="mt-2 space-y-2 rounded-lg bg-white p-3">
                    <label className="block text-xs text-slate-600">
                      Reason (optional)
                      <input
                        type="text"
                        placeholder="e.g. income too high"
                        className="mt-1 w-full rounded border border-slate-300 p-1.5 text-sm"
                        value={rejectNoteDraft}
                        onChange={(e) => setRejectNoteDraft(e.target.value)}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button onClick={() => confirmReject(r.scheme.id)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                        Mark as applied, rejected
                      </button>
                      <button onClick={() => setRejectFormOpenFor(null)} className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {rejectedResults.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Previously applied — not approved</h2>
          <p className="mt-1 text-sm text-slate-600">You told us these were turned down. If your situation has changed since, you can apply again.</p>
          <div className="mt-3 space-y-3">
            {rejectedResults.map((r) => {
              const rejection = rejectedSchemes.find((rs) => rs.schemeId === r.scheme.id);
              return (
                <div key={r.scheme.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{r.scheme.name}</span>
                    <span className="text-xs text-slate-500">Rejected {rejection?.rejectedDate}</span>
                  </div>
                  {rejection?.note && <p className="mt-1 text-sm text-slate-600">Reason given: {rejection.note}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <a
                      href={r.scheme.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300"
                    >
                      Reapply →
                    </a>
                    {onProfileUpdated && (
                      <button onClick={() => removeRejection(r.scheme.id)} className="text-xs text-slate-500 underline hover:text-slate-700">
                        Trying again — remove this record
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
