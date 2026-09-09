"use client";

import { useState } from "react";
import { schemes } from "@data/schemes";
import { evaluateEligibility, getRenewalStatuses } from "@/engine";
import { FieldWrapper } from "./FieldWrapper";
import { YesNoField } from "./YesNoField";
import {
  RELATIONSHIP_LABELS,
  buildHouseholdProfile,
  draftFromProfile,
  emptyDraft,
  emptyMember,
  isDraftComplete,
  type DraftHousehold,
  type DraftMember,
} from "@/lib/draftProfile";
import type { Citizenship, EmploymentType, EnrolledScheme, HouseholdProfile, HousingType, RejectedScheme, Relationship } from "@/types";
import type { IntakeExtractionResult } from "@/services/intakeExtraction";
import { getErrorMessage } from "@/lib/getErrorMessage";

interface ProfileEditorProps {
  /** null for a brand-new profile (onboarding); an existing profile to edit otherwise. */
  initialProfile: HouseholdProfile | null;
  onSave: (profile: HouseholdProfile) => Promise<void>;
  saveLabel?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Only .enrolledSchemes is actually read by getRenewalStatuses() — the rest are unused placeholders. */
function previewProfileForRenewals(draft: DraftHousehold, enrolledSchemes: EnrolledScheme[]): HouseholdProfile {
  return {
    householdId: "preview",
    members: draft.members.map((m) => ({
      age: m.age ?? 0,
      citizenship: m.citizenship ?? "citizen",
      employmentType: m.employmentType ?? "not_employed",
      hasDisability: m.hasDisability ?? false,
      cpfContributionsByAge55: m.cpfContributionsByAge55 ?? 0,
    })),
    grossHouseholdMonthlyIncome: draft.grossHouseholdMonthlyIncome ?? 0,
    housingType: draft.housingType ?? "hdb_4_room",
    annualValueOfHome: draft.annualValueOfHome ?? 0,
    propertyCount: draft.propertyCount ?? 0,
    hasCertifiedCareNeed: draft.hasCertifiedCareNeed ?? false,
    enrolledSchemes,
  };
}

/** Human-readable list of what's still missing, e.g. for a "you still need to fill in..." message. */
function getMissingFieldLabels(draft: DraftHousehold): string[] {
  const labels: string[] = [];
  if (draft.grossHouseholdMonthlyIncome === null) labels.push("Household income");
  if (draft.housingType === null) labels.push("Housing type");
  if (draft.annualValueOfHome === null) labels.push("Annual Value of your home");
  if (draft.propertyCount === null) labels.push("Number of properties owned");
  if (draft.hasCertifiedCareNeed === null) labels.push("Certified care need (Yes/No)");

  draft.members.forEach((m, index) => {
    const who = index === 0 ? "You" : RELATIONSHIP_LABELS[m.relationship];
    if (index > 0 && m.relationship === "unspecified") labels.push(`Household member ${index + 1}: relationship`);
    if (m.age === null) labels.push(`${who}: age`);
    if (m.citizenship === null) labels.push(`${who}: citizenship`);
    if (index === 0 && m.employmentType === null) labels.push(`${who}: work status`);
    if (index === 0 && m.hasDisability === null) labels.push(`${who}: disability (Yes/No)`);
    if (m.age !== null && m.age >= 55 && m.cpfContributionsByAge55 === null) labels.push(`${who}: CPF contributions by age 55`);
  });

  return labels;
}

export function ProfileEditor({ initialProfile, onSave, saveLabel = "Save profile" }: ProfileEditorProps) {
  const [draft, setDraft] = useState<DraftHousehold>(initialProfile ? draftFromProfile(initialProfile) : emptyDraft());
  const [enrolledSchemes, setEnrolledSchemes] = useState<EnrolledScheme[]>(initialProfile?.enrolledSchemes ?? []);
  const [addSchemeId, setAddSchemeId] = useState("");
  const [addSchemeDate, setAddSchemeDate] = useState(todayIso());

  const [rejectedSchemes, setRejectedSchemes] = useState<RejectedScheme[]>(initialProfile?.rejectedSchemes ?? []);
  const [addRejectedSchemeId, setAddRejectedSchemeId] = useState("");
  const [addRejectedDate, setAddRejectedDate] = useState(todayIso());
  const [addRejectedNote, setAddRejectedNote] = useState("");

  const [quickFillOpen, setQuickFillOpen] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [quickFillLoading, setQuickFillLoading] = useState(false);
  const [quickFillNote, setQuickFillNote] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function updateHousehold<K extends keyof DraftHousehold>(key: K, value: DraftHousehold[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateMember(index: number, patch: Partial<DraftMember>) {
    setDraft((prev) => ({ ...prev, members: prev.members.map((m, i) => (i === index ? { ...m, ...patch } : m)) }));
  }

  function addMember() {
    setDraft((prev) => ({ ...prev, members: [...prev.members, emptyMember("unspecified")] }));
  }

  function removeMember(index: number) {
    setDraft((prev) => ({ ...prev, members: prev.members.filter((_, i) => i !== index) }));
  }

  const availableToAdd = schemes.filter((s) => !enrolledSchemes.some((e) => e.schemeId === s.id));
  const availableToReject = schemes.filter((s) => !rejectedSchemes.some((r) => r.schemeId === s.id) && !enrolledSchemes.some((e) => e.schemeId === s.id));

  // A scheme can only be in one bucket at a time — enrolling in a scheme means any earlier
  // rejection is no longer the current state (e.g. the household reapplied and got approved).
  function addEnrolledScheme() {
    if (!addSchemeId) return;
    setEnrolledSchemes((prev) => [...prev, { schemeId: addSchemeId, enrollmentDate: addSchemeDate }]);
    setRejectedSchemes((prev) => prev.filter((r) => r.schemeId !== addSchemeId));
    setAddSchemeId("");
    setAddSchemeDate(todayIso());
  }

  function removeEnrolledScheme(schemeId: string) {
    setEnrolledSchemes((prev) => prev.filter((e) => e.schemeId !== schemeId));
  }

  function updateEnrolledScheme(schemeId: string, patch: Partial<Pick<EnrolledScheme, "enrollmentDate" | "actualAmount">>) {
    setEnrolledSchemes((prev) => prev.map((e) => (e.schemeId === schemeId ? { ...e, ...patch } : e)));
  }

  function addRejectedScheme() {
    if (!addRejectedSchemeId) return;
    setRejectedSchemes((prev) => [...prev, { schemeId: addRejectedSchemeId, rejectedDate: addRejectedDate, note: addRejectedNote.trim() || undefined }]);
    setAddRejectedSchemeId("");
    setAddRejectedDate(todayIso());
    setAddRejectedNote("");
  }

  function removeRejectedScheme(schemeId: string) {
    setRejectedSchemes((prev) => prev.filter((r) => r.schemeId !== schemeId));
  }

  async function handleQuickFill() {
    if (!freeText.trim()) return;
    setQuickFillLoading(true);
    setQuickFillNote(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      const extraction: IntakeExtractionResult = body.result;

      // Household-only merge, matching the same convention used on the dashboard's "what's
      // changed" card — only override fields the extraction actually found something for.
      setDraft((prev) => ({
        grossHouseholdMonthlyIncome: extraction.extracted.grossHouseholdMonthlyIncome ?? prev.grossHouseholdMonthlyIncome,
        housingType: extraction.extracted.housingType ?? prev.housingType,
        annualValueOfHome: extraction.extracted.annualValueOfHome ?? prev.annualValueOfHome,
        propertyCount: extraction.extracted.propertyCount ?? prev.propertyCount,
        hasCertifiedCareNeed: extraction.extracted.hasCertifiedCareNeed ?? prev.hasCertifiedCareNeed,
        members: prev.members,
      }));

      const newlyMentionedSchemes = extraction.enrolledSchemes.filter((e) => !enrolledSchemes.some((existing) => existing.schemeId === e.schemeId));
      if (newlyMentionedSchemes.length > 0) {
        setEnrolledSchemes((prev) => [...prev, ...newlyMentionedSchemes.map((e) => ({ schemeId: e.schemeId, enrollmentDate: e.enrollmentDate ?? todayIso() }))]);
      }

      setQuickFillNote("Filled in what we could find below — double-check the highlighted fields still make sense before saving.");
    } catch (err) {
      setQuickFillNote(getErrorMessage(err));
    } finally {
      setQuickFillLoading(false);
    }
  }

  async function handleSave() {
    if (!isDraftComplete(draft)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const profile = buildHouseholdProfile(draft, enrolledSchemes, initialProfile?.householdId ?? "pending", rejectedSchemes);
      await onSave(profile);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const previewProfile = previewProfileForRenewals(draft, enrolledSchemes);
  const renewals = getRenewalStatuses(previewProfile, schemes);
  const missingFieldLabels = getMissingFieldLabels(draft);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <button onClick={() => setQuickFillOpen((v) => !v)} className="flex w-full items-center justify-between text-left text-sm font-medium text-slate-700">
          <span>Optional: describe your situation to auto-fill some fields</span>
          <span className="text-slate-400">{quickFillOpen ? "▲" : "▼"}</span>
        </button>
        {quickFillOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              rows={3}
              placeholder="e.g. I care for my mum, household income is $2,400, I'm on ComCare"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
            />
            <button
              onClick={handleQuickFill}
              disabled={quickFillLoading || !freeText.trim()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300"
            >
              {quickFillLoading ? "Filling in…" : "Fill in from this"}
            </button>
            {quickFillNote && <p className="text-xs text-slate-500">{quickFillNote}</p>}
          </div>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Household details</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldWrapper
            label="Total household monthly income ($)"
            helpText="Add up everyone's pay before tax/CPF deductions — salary, wages, allowances. If no one earns anything, enter 0."
            missing={draft.grossHouseholdMonthlyIncome === null}
          >
            <input
              type="number"
              className="w-full rounded border border-slate-300 p-1.5 text-sm"
              value={draft.grossHouseholdMonthlyIncome ?? ""}
              onChange={(e) => updateHousehold("grossHouseholdMonthlyIncome", e.target.value === "" ? null : Number(e.target.value))}
            />
          </FieldWrapper>
          <FieldWrapper label="What type of home do you live in?" missing={draft.housingType === null}>
            <select
              className="w-full rounded border border-slate-300 p-1.5 text-sm"
              value={draft.housingType ?? ""}
              onChange={(e) => updateHousehold("housingType", (e.target.value || null) as HousingType | null)}
            >
              <option value="">Select…</option>
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
            missing={draft.annualValueOfHome === null}
          >
            <input
              type="number"
              className="w-full rounded border border-slate-300 p-1.5 text-sm"
              value={draft.annualValueOfHome ?? ""}
              onChange={(e) => updateHousehold("annualValueOfHome", e.target.value === "" ? null : Number(e.target.value))}
            />
          </FieldWrapper>
          <FieldWrapper
            label="Properties you (and your spouse) own"
            helpText="Count homes or other residential property owned, anywhere in the world. Most renters/HDB owners should enter 1."
            missing={draft.propertyCount === null}
          >
            <input
              type="number"
              className="w-full rounded border border-slate-300 p-1.5 text-sm"
              value={draft.propertyCount ?? ""}
              onChange={(e) => updateHousehold("propertyCount", e.target.value === "" ? null : Number(e.target.value))}
            />
          </FieldWrapper>
          <YesNoField
            label="Does anyone in your household have a certified care need?"
            helpText='This means a doctor or an official assessor has confirmed someone needs regular help with everyday activities — eating, bathing, dressing, moving around, toileting, or getting in/out of bed/chairs (called "Activities of Daily Living"). Simply being elderly, or having a minor/temporary health issue, does not count on its own — it needs to be a formal assessment.'
            value={draft.hasCertifiedCareNeed}
            onChange={(v) => updateHousehold("hasCertifiedCareNeed", v)}
            missing={draft.hasCertifiedCareNeed === null}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Household members</h2>
        <p className="text-sm text-slate-600">Include yourself and everyone living in your household, including the person you're caring for.</p>
        {draft.members.map((member, index) => (
          <div key={index} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-4">
            <div className="col-span-2 flex items-center justify-between sm:col-span-4">
              {index === 0 ? (
                <span className="text-sm font-medium text-slate-700">You</span>
              ) : (
                <div className="w-full max-w-[200px]">
                  <FieldWrapper label="Relationship to you" missing={member.relationship === "unspecified"}>
                    <select
                      className="w-full rounded border border-slate-300 p-1.5 text-sm"
                      value={member.relationship === "unspecified" ? "" : member.relationship}
                      onChange={(e) => updateMember(index, { relationship: (e.target.value || "unspecified") as Relationship })}
                    >
                      <option value="">Select…</option>
                      <option value="spouse">Spouse</option>
                      <option value="parent">Parent</option>
                      <option value="child">Child</option>
                      <option value="sibling">Sibling</option>
                      <option value="other_relative">Other relative</option>
                      <option value="domestic_helper">Domestic helper</option>
                    </select>
                  </FieldWrapper>
                </div>
              )}
              {index > 0 && (
                <button onClick={() => removeMember(index)} className="text-xs text-rose-600 underline">
                  Remove
                </button>
              )}
            </div>
            <FieldWrapper label="Age" missing={member.age === null}>
              <input
                type="number"
                className="w-full rounded border border-slate-300 p-1.5 text-sm"
                value={member.age ?? ""}
                onChange={(e) => updateMember(index, { age: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </FieldWrapper>
            <FieldWrapper label="Citizenship" missing={member.citizenship === null}>
              <select
                className="w-full rounded border border-slate-300 p-1.5 text-sm"
                value={member.citizenship ?? ""}
                onChange={(e) => updateMember(index, { citizenship: (e.target.value || null) as Citizenship | null })}
              >
                <option value="">Select…</option>
                <option value="citizen">Singapore Citizen</option>
                <option value="pr">Permanent Resident</option>
                <option value="other">Other</option>
              </select>
            </FieldWrapper>
            {index === 0 && (
              <>
                <FieldWrapper label="Your work status" helpText="This is about you, the person filling in this form." missing={member.employmentType === null}>
                  <select
                    className="w-full rounded border border-slate-300 p-1.5 text-sm"
                    value={member.employmentType ?? ""}
                    onChange={(e) => updateMember(index, { employmentType: (e.target.value || null) as EmploymentType | null })}
                  >
                    <option value="">Select…</option>
                    <option value="employee">Employee (drawing a salary)</option>
                    <option value="self_employed">Self-employed</option>
                    <option value="platform_worker">Platform worker (delivery, private-hire driver, etc.)</option>
                    <option value="not_employed">Not currently working</option>
                  </select>
                </FieldWrapper>
                <YesNoField
                  label="Do you have a disability?"
                  helpText="A disability formally assessed by a doctor, not a self-diagnosis."
                  value={member.hasDisability}
                  onChange={(v) => updateMember(index, { hasDisability: v })}
                  missing={member.hasDisability === null}
                />
              </>
            )}
            {member.age !== null && member.age >= 55 && (
              <FieldWrapper
                label="Total CPF contributions made by age 55 ($)"
                helpText="Only used for Silver Support eligibility. Find this on your CPF statement (cpf.gov.sg) — if unsure, enter your best estimate; entering 0 may make Silver Support look more favorable than it should."
                missing={member.cpfContributionsByAge55 === null}
              >
                <input
                  type="number"
                  className="w-full rounded border border-slate-300 p-1.5 text-sm"
                  value={member.cpfContributionsByAge55 ?? ""}
                  onChange={(e) => updateMember(index, { cpfContributionsByAge55: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </FieldWrapper>
            )}
          </div>
        ))}
        <button onClick={addMember} className="text-sm text-slate-500 underline hover:text-slate-700">
          + Add another household member
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Support schemes you're on</h2>
        <p className="text-sm text-slate-600">Add each scheme you're currently receiving, and when it started — we'll work out when it's next due.</p>

        {enrolledSchemes.length > 0 && (
          <div className="space-y-2">
            {enrolledSchemes.map((e) => {
              const scheme = schemes.find((s) => s.id === e.schemeId);
              const renewal = renewals.find((r) => r.schemeId === e.schemeId);
              const estimate = scheme ? evaluateEligibility(scheme, previewProfile).estimatedBenefitAmount : null;
              return (
                <div key={e.schemeId} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{scheme?.name ?? e.schemeId}</span>
                    <button onClick={() => removeEnrolledScheme(e.schemeId)} className="text-xs text-rose-600 underline">
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-xs text-slate-600">
                      Started
                      <input
                        type="date"
                        className="rounded border border-slate-300 p-1"
                        value={e.enrollmentDate}
                        onChange={(ev) => updateEnrolledScheme(e.schemeId, { enrollmentDate: ev.target.value })}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-600">
                      Amount actually received (${scheme ? `/${scheme.benefit.frequency}` : ""})
                      <input
                        type="number"
                        placeholder={estimate !== null ? String(estimate) : "unknown"}
                        className="w-32 rounded border border-slate-300 p-1"
                        value={e.actualAmount ?? ""}
                        onChange={(ev) => updateEnrolledScheme(e.schemeId, { actualAmount: ev.target.value === "" ? undefined : Number(ev.target.value) })}
                      />
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {estimate !== null
                      ? `Leave blank to use our estimate of ~$${estimate}/${scheme?.benefit.frequency}. Some schemes (especially ComCare) pay less than the theoretical max, or a caseworker-assessed amount we can't compute.`
                      : "We can't estimate this scheme's amount (it's case-by-case) — enter what you actually receive if you know it."}
                  </p>
                  {renewal && (
                    <p className={`mt-1 text-xs font-medium ${renewal.daysUntilRenewal === null ? "text-slate-400" : renewal.daysUntilRenewal < 0 ? "text-rose-600" : renewal.daysUntilRenewal <= 30 ? "text-amber-600" : "text-emerald-600"}`}>
                      {renewal.daysUntilRenewal === null
                        ? "No fixed renewal cycle on file"
                        : renewal.daysUntilRenewal < 0
                          ? `Renewal overdue by ${-renewal.daysUntilRenewal} day${-renewal.daysUntilRenewal === 1 ? "" : "s"} (was due ${renewal.nextRenewalDate})`
                          : `${renewal.daysUntilRenewal} day${renewal.daysUntilRenewal === 1 ? "" : "s"} until renewal (due ${renewal.nextRenewalDate})`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <label className="text-xs text-slate-600">
            <span className="mb-1 block">Add a scheme</span>
            <select className="rounded border border-slate-300 p-1.5 text-sm" value={addSchemeId} onChange={(e) => setAddSchemeId(e.target.value)}>
              <option value="">Select…</option>
              {availableToAdd.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            <span className="mb-1 block">Started</span>
            <input type="date" className="rounded border border-slate-300 p-1.5 text-sm" value={addSchemeDate} onChange={(e) => setAddSchemeDate(e.target.value)} />
          </label>
          <button onClick={addEnrolledScheme} disabled={!addSchemeId} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300">
            Add
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Applied but not approved</h2>
        <p className="text-sm text-slate-600">
          If you've applied for a scheme and were turned down, note it here — we'll stop suggesting it and a caseworker reading your handoff summary will
          know not to repeat the same application.
        </p>

        {rejectedSchemes.length > 0 && (
          <div className="space-y-2">
            {rejectedSchemes.map((r) => {
              const scheme = schemes.find((s) => s.id === r.schemeId);
              return (
                <div key={r.schemeId} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{scheme?.name ?? r.schemeId}</span>
                    <button onClick={() => removeRejectedScheme(r.schemeId)} className="text-xs text-rose-600 underline">
                      Remove
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Rejected {r.rejectedDate}
                    {r.note ? ` — ${r.note}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <label className="text-xs text-slate-600">
            <span className="mb-1 block">Scheme</span>
            <select className="rounded border border-slate-300 p-1.5 text-sm" value={addRejectedSchemeId} onChange={(e) => setAddRejectedSchemeId(e.target.value)}>
              <option value="">Select…</option>
              {availableToReject.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            <span className="mb-1 block">Rejected on</span>
            <input type="date" className="rounded border border-slate-300 p-1.5 text-sm" value={addRejectedDate} onChange={(e) => setAddRejectedDate(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600">
            <span className="mb-1 block">Reason (optional)</span>
            <input
              type="text"
              placeholder="e.g. income too high"
              className="rounded border border-slate-300 p-1.5 text-sm"
              value={addRejectedNote}
              onChange={(e) => setAddRejectedNote(e.target.value)}
            />
          </label>
          <button onClick={addRejectedScheme} disabled={!addRejectedSchemeId} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300">
            Add
          </button>
        </div>
      </section>

      <div className="space-y-2">
        <button
          onClick={handleSave}
          disabled={!isDraftComplete(draft) || saving}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? "Saving…" : saveLabel}
        </button>
        {missingFieldLabels.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-medium">Still need (highlighted above):</p>
            <ul className="mt-1 list-disc pl-4">
              {missingFieldLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        )}
        {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
        {savedAt && <p className="text-sm text-emerald-600">Saved.</p>}
      </div>
    </div>
  );
}
