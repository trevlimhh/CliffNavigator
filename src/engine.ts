// Deterministic eligibility + simulation engine. No LLM, no I/O — pure functions
// over plain data so this can be imported unchanged from a Next.js API route later.

import type {
  Scheme,
  HouseholdProfile,
  EligibilityCriterion,
  CriterionResult,
  EligibilityResult,
  EligibilityStatus,
  EnrolledScheme,
  ProfileChange,
  SimulationResult,
  Frequency,
  RenewalStatus,
  IncomeCliffInfo,
} from "./types";

export function getPerCapitaMonthlyIncome(profile: HouseholdProfile): number {
  return profile.grossHouseholdMonthlyIncome / profile.members.length;
}

/**
 * The amount to actually display/total for an enrolled scheme: the household's self-reported
 * `actualAmount` if they've told us it differs from the formula estimate (some schemes pay less
 * than their theoretical max, and discretionary ones — ComCare's sub-schemes — often have no
 * formula estimate at all), falling back to `estimatedBenefitAmount` otherwise. Purely a display
 * concern for totals/summaries — eligibility and cliff/simulation math stay on the formula
 * estimate throughout, since "what a household could get" and "what they told us they got" are
 * different questions and conflating them would make the core eligibility check depend on state
 * it doesn't need (same principle as estimateCurrentBenefitAmount() below).
 */
export function getReportedAmount(result: EligibilityResult, enrolled: EnrolledScheme | undefined): number | null {
  if (enrolled?.actualAmount !== undefined) return enrolled.actualAmount;
  return result.estimatedBenefitAmount;
}

function evaluateCriterion(criterion: EligibilityCriterion, profile: HouseholdProfile): CriterionResult {
  switch (criterion.type) {
    case "household_income_threshold": {
      const income =
        criterion.basis === "per_capita" ? getPerCapitaMonthlyIncome(profile) : profile.grossHouseholdMonthlyIncome;
      const passed = income <= criterion.maxAmount;
      return {
        criterion,
        passed,
        reason: `${criterion.basis} income $${income.toFixed(0)} ${passed ? "<=" : ">"} $${criterion.maxAmount} threshold`,
      };
    }
    case "age": {
      const ages =
        criterion.appliesTo === "applicant" ? [profile.members[0]?.age ?? -1] : profile.members.map((m) => m.age);
      const passed = ages.some(
        (age) => (criterion.min === undefined || age >= criterion.min) && (criterion.max === undefined || age <= criterion.max),
      );
      return {
        criterion,
        passed,
        reason: `${criterion.appliesTo} age(s) [${ages.join(", ")}] vs required range [${criterion.min ?? "-"}, ${criterion.max ?? "-"}]`,
      };
    }
    case "housing_type": {
      const passed = criterion.allowed.includes(profile.housingType);
      return { criterion, passed, reason: `housing type "${profile.housingType}" ${passed ? "is" : "is not"} in allowed list` };
    }
    case "annual_value_threshold": {
      const passed = profile.annualValueOfHome <= criterion.maxAmount;
      return {
        criterion,
        passed,
        reason: `home annual value $${profile.annualValueOfHome} ${passed ? "<=" : ">"} $${criterion.maxAmount}`,
      };
    }
    case "property_count": {
      const passed = profile.propertyCount <= criterion.maxCount;
      return {
        criterion,
        passed,
        reason: `owns ${profile.propertyCount} propert${profile.propertyCount === 1 ? "y" : "ies"} (max ${criterion.maxCount})`,
      };
    }
    case "citizenship": {
      const passed =
        criterion.required === "citizen"
          ? profile.members.some((m) => m.citizenship === "citizen")
          : profile.members.some((m) => m.citizenship === "citizen" || m.citizenship === "pr");
      return { criterion, passed, reason: `citizenship requirement (${criterion.required}) ${passed ? "met" : "not met"}` };
    }
    case "certified_care_need": {
      const passed = profile.hasCertifiedCareNeed;
      return { criterion, passed, reason: `household ${passed ? "has" : "does not have"} a certified care need` };
    }
    case "employment_status": {
      const applicant = profile.members[0];
      const passed =
        criterion.required === "any"
          ? true
          : applicant !== undefined &&
            (criterion.required === "any_working" ? applicant.employmentType !== "not_employed" : applicant.employmentType === criterion.required);
      return {
        criterion,
        passed,
        reason: `applicant employment status "${applicant?.employmentType ?? "unknown"}" vs requirement (${criterion.required})`,
      };
    }
    case "cpf_contributions_by_55": {
      const qualifyingMembers = profile.members.filter((m) => m.age >= 55);
      const passed = qualifyingMembers.length > 0 && qualifyingMembers.some((m) => m.cpfContributionsByAge55 <= criterion.maxAmount);
      return {
        criterion,
        passed,
        reason: `at least one 55+ member's CPF contributions by 55 <= $${criterion.maxAmount}: ${passed}`,
      };
    }
    case "workfare_income_floor": {
      // The MVP profile doesn't track each member's individual income, so per-capita household
      // income is used as a stand-in for "the applicant's income" — a known simplification.
      const income = getPerCapitaMonthlyIncome(profile);
      const belowMax = income <= criterion.maxAmount;
      const meetsStandardMin = income >= criterion.standardMinAmount;
      const applicant = profile.members[0];
      const qualifiesForFloorWaiver =
        profile.hasCertifiedCareNeed || // proxy for "is a caregiver of a certified-care-need household member"
        (applicant?.hasDisability ?? false) ||
        profile.enrolledSchemes.some((e) => e.schemeId === "comcare_smta");
      const passed = belowMax && (meetsStandardMin || qualifiesForFloorWaiver);
      return {
        criterion,
        passed,
        reason: `applicant income proxy $${income.toFixed(0)} <= $${criterion.maxAmount} and (>= $${criterion.standardMinAmount} floor or floor-waived): ${passed}`,
      };
    }
    case "discretionary_assessment": {
      // Mechanically always passes; its real effect is applied in evaluateEligibility(),
      // which downgrades an otherwise-"eligible" result to "possibly_eligible_requires_assessment".
      return { criterion, passed: true, reason: criterion.note };
    }
  }
}

/**
 * Steady-state benefit estimate — does not know about enrollment history, so it always returns
 * the non-first-year amount for schemes with `firstYearAmount` set (e.g. CTG). Use
 * estimateCurrentBenefitAmount() when an enrollment date is available and first-year amounts matter.
 */
export function estimateBenefitAmount(scheme: Scheme, profile: HouseholdProfile): number | null {
  const { benefit } = scheme;

  if (benefit.multiPropertyCapsToLowestTier && profile.propertyCount > 1 && benefit.meansTestedTiers) {
    return Math.min(...benefit.meansTestedTiers.map((t) => t.amount));
  }

  if (benefit.meansTestedTiers) {
    const income = getPerCapitaMonthlyIncome(profile);
    const sortedAscending = [...benefit.meansTestedTiers].sort((a, b) => a.maxAmount - b.maxAmount);
    const tier = sortedAscending.find((t) => income <= t.maxAmount);
    return tier ? tier.amount : null;
  }

  if (benefit.householdSizeTiers) {
    const size = profile.members.length;
    const sortedAscending = [...benefit.householdSizeTiers].sort((a, b) => a.maxHouseholdSize - b.maxHouseholdSize);
    const tier = sortedAscending.find((t) => size <= t.maxHouseholdSize);
    // Households larger than the largest published band fall back to that band's rate — a
    // documented simplification (see comcare_lta's simplificationNote in data/schemes.ts).
    return tier ? tier.amount : (sortedAscending[sortedAscending.length - 1]?.amount ?? null);
  }

  if (benefit.amountByEmploymentType) {
    const applicantType = profile.members[0]?.employmentType;
    if (!applicantType) return null;
    return benefit.amountByEmploymentType[applicantType] ?? null;
  }

  return benefit.amount ?? null;
}

export function evaluateEligibility(scheme: Scheme, profile: HouseholdProfile): EligibilityResult {
  const criteriaResults = scheme.eligibility.map((c) => evaluateCriterion(c, profile));
  const allPassed = criteriaResults.every((r) => r.passed);
  const isDiscretionary = scheme.eligibility.some((c) => c.type === "discretionary_assessment");

  let status: EligibilityStatus;
  if (!allPassed) {
    status = "ineligible";
  } else if (isDiscretionary) {
    status = "possibly_eligible_requires_assessment";
  } else {
    status = "eligible";
  }

  const estimatedBenefitAmount = status === "ineligible" ? null : estimateBenefitAmount(scheme, profile);

  return { scheme, status, criteriaResults, estimatedBenefitAmount };
}

export function evaluateAllSchemes(profile: HouseholdProfile, catalog: Scheme[]): EligibilityResult[] {
  return catalog.map((scheme) => evaluateEligibility(scheme, profile));
}

/**
 * Resolves the benefit a household is actually receiving right now for a scheme it's enrolled
 * in, accounting for `firstYearAmount` (e.g. CTG's $400 first year vs $200/year after). Separate
 * from estimateBenefitAmount()/evaluateEligibility() because those don't take an enrollment date
 * — this function is the one enrollment-aware amount lookup, used by callers that have an
 * EnrolledScheme record (see getRenewalStatuses() and src/cli.ts for example usage).
 */
export function estimateCurrentBenefitAmount(
  scheme: Scheme,
  profile: HouseholdProfile,
  enrollmentDate: string,
  asOf: Date = new Date(),
): number | null {
  const steadyState = estimateBenefitAmount(scheme, profile);
  if (scheme.benefit.firstYearAmount === undefined) return steadyState;

  const oneYearAfterEnrollment = new Date(enrollmentDate);
  oneYearAfterEnrollment.setUTCFullYear(oneYearAfterEnrollment.getUTCFullYear() + 1);
  return asOf < oneYearAfterEnrollment ? scheme.benefit.firstYearAmount : steadyState;
}

/**
 * Converts a benefit amount into a monthly-equivalent figure for cross-scheme comparison.
 *
 * Policy decision (flagged for review): a "one_time" payout normalizes to $0/month rather
 * than being smeared across 12 months — spreading a one-off credit into an ongoing monthly
 * figure would overstate it as a recurring income source. None of the 5 schemes currently
 * use "one_time" (CTG is modeled as "annual"), but callers should surface one-time amounts
 * separately if that ever changes, rather than relying on this function to represent them.
 */
export function normalizeToMonthly(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "annual":
      return amount / 12;
    case "one_time":
      return 0;
  }
}

function monthlyValueIfReceiving(result: EligibilityResult): number {
  if (result.status === "ineligible" || result.estimatedBenefitAmount === null) return 0;
  return normalizeToMonthly(result.estimatedBenefitAmount, result.scheme.benefit.frequency);
}

/**
 * Simulates a what-if change and diffs eligibility before/after.
 *
 * The two change types are fundamentally different phenomena and are handled differently:
 * - "income_change" shifts a profile field that eligibility criteria read directly, so
 *   every scheme is recomputed against the changed profile.
 * - "scheme_expiry" does NOT change income, household composition, or any other criterion —
 *   it represents an exogenous event (e.g. a time-limited ComCare SMTA block running out and
 *   not being renewed) where the household stops receiving one specific scheme regardless of
 *   whether they'd still qualify on paper. Recomputing eligibility against an unchanged profile
 *   would (correctly) return the same result for every scheme, including the "expired" one — so
 *   that scheme's post-change status is forced to "ineligible" instead, but only if the
 *   household was both enrolled in it AND actually receiving it beforehand.
 *
 * `gained` / `lost` / `unaffected` are based on the resulting before/after STATUS transitions
 * (eligible or possibly_eligible vs. ineligible) — for income changes this surfaces schemes a
 * household could newly claim, not only ones they already have. `netMonthlyDollarImpact` mirrors
 * a "full take-up" assumption for income changes: it sums the change in estimated monthly value
 * across every scheme the household is (or becomes) eligible for, regardless of `enrolledSchemes`.
 */
/**
 * Shared diffing logic behind both simulateChange() and compareProfiles(): given a before/after
 * pair of eligibility results for the same catalog (in the same order), buckets each scheme into
 * gained/lost/unaffected/requiresAssessment and sums the monthly dollar impact. Not exported —
 * callers go through simulateChange() or compareProfiles(), which are responsible for producing
 * a valid before/after pair in the first place.
 */
function buildSimulationResult(before: EligibilityResult[], after: EligibilityResult[], catalog: Scheme[]): SimulationResult {
  const gained: Scheme[] = [];
  const lost: Scheme[] = [];
  const unaffected: Scheme[] = [];
  const requiresAssessment: Scheme[] = [];
  let netMonthlyDollarImpact = 0;

  catalog.forEach((scheme, i) => {
    const b = before[i]!;
    const a = after[i]!;
    const wasReceiving = b.status !== "ineligible";
    const nowReceiving = a.status !== "ineligible";

    if (!wasReceiving && nowReceiving) gained.push(scheme);
    else if (wasReceiving && !nowReceiving) lost.push(scheme);
    else unaffected.push(scheme);

    if (a.status === "possibly_eligible_requires_assessment") requiresAssessment.push(scheme);

    netMonthlyDollarImpact += monthlyValueIfReceiving(a) - monthlyValueIfReceiving(b);
  });

  return { before, after, gained, lost, unaffected, requiresAssessment, netMonthlyDollarImpact };
}

export function simulateChange(profile: HouseholdProfile, change: ProfileChange, catalog: Scheme[]): SimulationResult {
  const before = evaluateAllSchemes(profile, catalog);

  let after: EligibilityResult[];
  if (change.type === "income_change") {
    const afterProfile: HouseholdProfile = { ...profile, grossHouseholdMonthlyIncome: change.newGrossHouseholdMonthlyIncome };
    after = evaluateAllSchemes(afterProfile, catalog);
  } else {
    const schemeId = change.schemeId;
    after = before.map((result) => {
      if (result.scheme.id !== schemeId) return result;
      const wasActuallyReceiving = result.status !== "ineligible" && profile.enrolledSchemes.some((e) => e.schemeId === schemeId);
      if (!wasActuallyReceiving) return result; // nothing to expire — no-op
      return { ...result, status: "ineligible", estimatedBenefitAmount: null };
    });
  }

  return buildSimulationResult(before, after, catalog);
}

/**
 * Compares two ACTUAL profiles (e.g. a stored profile vs. a freshly re-extracted one after the
 * user describes what's changed in their life), as opposed to simulateChange()'s single
 * hypothetical income/scheme-expiry tweak. Useful when the update could touch any combination of
 * fields — a new job, a household member moving out, a change in care needs — not just the two
 * narrow change types simulateChange() models. Shares the same gained/lost/unaffected/dollar-impact
 * semantics via buildSimulationResult(), so a "situation update" and a "what-if simulation" always
 * mean the same thing in the UI.
 */
export function compareProfiles(oldProfile: HouseholdProfile, newProfile: HouseholdProfile, catalog: Scheme[]): SimulationResult {
  const before = evaluateAllSchemes(oldProfile, catalog);
  const after = evaluateAllSchemes(newProfile, catalog);
  return buildSimulationResult(before, after, catalog);
}

/**
 * For every scheme the household says it's enrolled in, works out when it's next due for
 * renewal/reassessment from `scheme.duration.renewalCycleMonths` and the recorded enrollment
 * date. This answers "when does my grant end" for the common case (a fixed reassessment cycle);
 * it does NOT predict a discretionary non-renewal (e.g. an SSO declining to renew SMTA early) —
 * for that, a household needs to actually be reassessed. Throws if enrolled in an unknown scheme
 * id, since that indicates a data-entry bug upstream rather than a normal "not eligible" case.
 */
export function getRenewalStatuses(profile: HouseholdProfile, catalog: Scheme[], asOf: Date = new Date()): RenewalStatus[] {
  return profile.enrolledSchemes.map((enrolled) => {
    const scheme = catalog.find((s) => s.id === enrolled.schemeId);
    if (!scheme) throw new Error(`Household is enrolled in unknown scheme id "${enrolled.schemeId}"`);

    const renewalCycleMonths = scheme.duration.renewalCycleMonths ?? null;
    let nextRenewalDate: string | null = null;
    if (renewalCycleMonths !== null) {
      const d = new Date(enrolled.enrollmentDate);
      d.setUTCMonth(d.getUTCMonth() + renewalCycleMonths);
      nextRenewalDate = d.toISOString().slice(0, 10);
    }
    const daysUntilRenewal = nextRenewalDate
      ? Math.round((new Date(nextRenewalDate).getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      schemeId: scheme.id,
      enrollmentDate: enrolled.enrollmentDate,
      isTimeLimited: scheme.duration.timeLimited,
      renewalCycleMonths,
      nextRenewalDate,
      daysUntilRenewal,
    };
  });
}

function findIncomeCeiling(scheme: Scheme): { basis: "gross_household" | "per_capita"; maxAmount: number } | null {
  for (const c of scheme.eligibility) {
    if (c.type === "household_income_threshold") return { basis: c.basis, maxAmount: c.maxAmount };
    // workfare_income_floor's proxy income basis is the same per-capita stand-in used elsewhere.
    if (c.type === "workfare_income_floor") return { basis: "per_capita", maxAmount: c.maxAmount };
  }
  return null;
}

/**
 * For every scheme in the catalog, reports how much income "buffer" the household has before
 * hitting an eligibility cliff (losing the scheme entirely) or a tier cliff (dropping to a lower
 * payout tier while remaining eligible). This is the proactive counterpart to simulateChange():
 * instead of asking "what if income becomes $X", it answers "how close am I to a cliff right now".
 *
 * Limitation: this only models the upper-bound (means-tested ceiling) cliff. It does not model
 * WIS's lower-bound $500 floor requirement (losing eligibility because income drops too low) —
 * that's a secondary, waivable edge case (see workfare_income_floor) rather than the primary
 * "rising income costs you a benefit" cliff this function is built to surface.
 */
export function getIncomeCliffs(profile: HouseholdProfile, catalog: Scheme[]): IncomeCliffInfo[] {
  return catalog.map((scheme) => {
    const result = evaluateEligibility(scheme, profile);
    const ceiling = findIncomeCeiling(scheme);

    if (!ceiling) {
      return {
        schemeId: scheme.id,
        status: result.status,
        incomeBasis: null,
        currentIncomeValue: null,
        ineligibilityThreshold: null,
        bufferToIneligibility: null,
        nextTierDropThreshold: null,
        bufferToNextTierDrop: null,
      };
    }

    const currentIncomeValue = ceiling.basis === "per_capita" ? getPerCapitaMonthlyIncome(profile) : profile.grossHouseholdMonthlyIncome;
    const bufferToIneligibility = ceiling.maxAmount - currentIncomeValue;

    let nextTierDropThreshold: number | null = null;
    let bufferToNextTierDrop: number | null = null;
    if (scheme.benefit.meansTestedTiers && result.status !== "ineligible") {
      const sortedAscending = [...scheme.benefit.meansTestedTiers].sort((a, b) => a.maxAmount - b.maxAmount);
      const currentTier = sortedAscending.find((t) => currentIncomeValue <= t.maxAmount);
      if (currentTier) {
        nextTierDropThreshold = currentTier.maxAmount;
        bufferToNextTierDrop = currentTier.maxAmount - currentIncomeValue;
      }
    }

    return {
      schemeId: scheme.id,
      status: result.status,
      incomeBasis: ceiling.basis,
      currentIncomeValue,
      ineligibilityThreshold: ceiling.maxAmount,
      bufferToIneligibility,
      nextTierDropThreshold,
      bufferToNextTierDrop,
    };
  });
}
