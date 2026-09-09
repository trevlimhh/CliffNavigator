// Pure, deterministic formatter for the "warm handoff between agencies" concept — a caseworker
// referral note benefits from being predictable and factual, so this is plain code, not an LLM
// call. Independently testable with no mocking required.

import { getReportedAmount, normalizeToMonthly } from "../engine";
import type { EligibilityResult, EnrolledScheme, HouseholdProfile } from "../types";

// Small local copy rather than importing src/lib/draftProfile.ts's RELATIONSHIP_LABELS — that
// file uses the "@/" alias (Next-only), and this one deliberately stays alias-free so it keeps
// working under both Turbopack and Vitest/tsx (see the module-resolution note in CLAUDE.md).
const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: "Spouse",
  parent: "Parent",
  child: "Child",
  sibling: "Sibling",
  other_relative: "Other relative",
  domestic_helper: "Domestic helper",
};

function formatMember(member: HouseholdProfile["members"][number], index: number): string {
  const role = index === 0 ? "Applicant" : (RELATIONSHIP_LABELS[member.relationship ?? ""] ?? `Household member ${index + 1}`);
  return `${role}: age ${member.age}, ${member.citizenship}, ${member.employmentType.replace("_", " ")}${member.hasDisability ? ", has a disability" : ""}`;
}

function statusLabel(status: EligibilityResult["status"]): string {
  return status === "eligible" ? "Eligible" : status === "possibly_eligible_requires_assessment" ? "Possibly eligible (needs assessment)" : "Not currently eligible";
}

function formatEnrolledLine(result: EligibilityResult, enrolled: EnrolledScheme): string {
  const reported = getReportedAmount(result, enrolled);
  const isSelfReported = enrolled.actualAmount !== undefined;
  let amountStr = "";
  if (reported !== null) {
    amountStr = isSelfReported ? ` — receiving $${reported}/${result.scheme.benefit.frequency}` : ` — est. $${reported}/${result.scheme.benefit.frequency}`;
    if (isSelfReported && result.estimatedBenefitAmount !== null && result.estimatedBenefitAmount !== reported) {
      amountStr += ` (est. up to $${result.estimatedBenefitAmount})`;
    }
  }
  return `- ${result.scheme.name}: enrolled since ${enrolled.enrollmentDate}${amountStr}`;
}

function formatEligibleNotEnrolledLine(result: EligibilityResult): string {
  const amountStr = result.estimatedBenefitAmount !== null ? ` — est. $${result.estimatedBenefitAmount}/${result.scheme.benefit.frequency}` : "";
  return `- ${result.scheme.name}: ${statusLabel(result.status)}, not yet enrolled${amountStr}`;
}

function formatRejectedLine(schemeName: string, rejectedDate: string, note: string | undefined): string {
  return `- ${schemeName}: applied, rejected ${rejectedDate}${note ? ` — ${note}` : ""}`;
}

export function formatHandoffSummary(profile: HouseholdProfile, eligibility: EligibilityResult[], generatedAt: Date = new Date()): string {
  const perCapitaIncome = profile.grossHouseholdMonthlyIncome / profile.members.length;
  const enrolledById = new Map(profile.enrolledSchemes.map((e) => [e.schemeId, e]));
  const rejectedSchemes = profile.rejectedSchemes ?? [];
  const rejectedIds = new Set(rejectedSchemes.map((r) => r.schemeId));

  // "Currently enrolled" only counts schemes the household is actually enrolled in — this is the
  // household's real ongoing support, not a best-case "if they claimed everything" figure (that
  // full-take-up number is netMonthlyDollarImpact's job elsewhere, not this summary's). Uses
  // getReportedAmount() so a self-reported actual amount (often lower than the formula estimate)
  // drives the total, not a number the household already told us is wrong.
  const totalMonthlyEstimate = eligibility.reduce((sum, r) => {
    const enrolled = enrolledById.get(r.scheme.id);
    if (!enrolled) return sum;
    const reported = getReportedAmount(r, enrolled);
    if (reported === null) return sum;
    return sum + normalizeToMonthly(reported, r.scheme.benefit.frequency);
  }, 0);

  const enrolledResults = eligibility.filter((r) => enrolledById.has(r.scheme.id));
  const eligibleNotEnrolled = eligibility.filter((r) => !enrolledById.has(r.scheme.id) && !rejectedIds.has(r.scheme.id) && r.status !== "ineligible");

  const lines: string[] = [
    "CAREGIVER SUPPORT SUMMARY (unofficial — prepared via Benefit Cliff Navigator, for reference only)",
    `Generated: ${generatedAt.toISOString().slice(0, 10)}`,
    "",
    "HOUSEHOLD",
    `Household size: ${profile.members.length}`,
    `Gross monthly household income: $${profile.grossHouseholdMonthlyIncome.toFixed(0)} (approx. $${perCapitaIncome.toFixed(0)}/person)`,
    `Housing: ${profile.housingType.replace(/_/g, " ")}`,
    `Certified care need in household: ${profile.hasCertifiedCareNeed ? "Yes" : "No"}`,
    ...profile.members.map(formatMember),
    "",
    "CURRENTLY ENROLLED",
    ...(enrolledResults.length > 0 ? enrolledResults.map((r) => formatEnrolledLine(r, enrolledById.get(r.scheme.id)!)) : ["- None"]),
    "",
    "MAY BE ELIGIBLE FOR (NOT YET ENROLLED)",
    ...(eligibleNotEnrolled.length > 0 ? eligibleNotEnrolled.map(formatEligibleNotEnrolledLine) : ["- None"]),
  ];

  if (rejectedSchemes.length > 0) {
    lines.push(
      "",
      "PREVIOUSLY APPLIED — NOT APPROVED",
      ...rejectedSchemes.map((r) => {
        const scheme = eligibility.find((e) => e.scheme.id === r.schemeId)?.scheme;
        return formatRejectedLine(scheme?.name ?? r.schemeId, r.rejectedDate, r.note);
      }),
    );
  }

  lines.push(
    "",
    `Estimated total ongoing support (schemes currently enrolled in, normalized to monthly): ~$${totalMonthlyEstimate.toFixed(0)}/month`,
    "",
    "Figures are planning estimates only, based on self-reported information. Please verify with",
    "the relevant agency (MSF Social Service Office, AIC, CPF Board, or MOM) before acting on them.",
  );

  return lines.join("\n");
}
