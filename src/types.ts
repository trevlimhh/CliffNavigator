// Shared types for the benefit-cliff / transition-cliff rules engine.
// Kept dependency-free so this file can be reused as-is in the future Next.js app.

export type Frequency = "monthly" | "quarterly" | "annual" | "one_time";

export type HousingType =
  | "hdb_1_2_room"
  | "hdb_3_room"
  | "hdb_4_room"
  | "hdb_5_room_or_exec"
  | "private_property";

export type Citizenship = "citizen" | "pr" | "other";

export type EmploymentType = "employee" | "self_employed" | "platform_worker" | "not_employed";

/** Relationship to the applicant (members[0]). Display/organization only — no eligibility criterion reads this. */
export type Relationship = "self" | "spouse" | "parent" | "child" | "sibling" | "other_relative" | "domestic_helper" | "unspecified";

/**
 * One gate a household must clear for a scheme. A scheme's `eligibility` array is evaluated as
 * AND — every criterion must pass. Criteria are intentionally narrow (one fact each) so each can
 * be sourced/verified independently against the scheme's public page.
 */
export type EligibilityCriterion =
  | { type: "household_income_threshold"; basis: "gross_household" | "per_capita"; maxAmount: number }
  | { type: "age"; min?: number; max?: number; appliesTo: "applicant" | "any_household_member" }
  | { type: "housing_type"; allowed: HousingType[] }
  | { type: "annual_value_threshold"; maxAmount: number }
  | { type: "property_count"; maxCount: number }
  | { type: "citizenship"; required: "citizen" | "pr_or_citizen" }
  | { type: "certified_care_need"; note?: string }
  | { type: "employment_status"; required: EmploymentType | "any_working" | "any" }
  /** Silver Support's CPF-contributions-by-55 cap. Checked against any member who also clears the scheme's age gate. */
  | { type: "cpf_contributions_by_55"; maxAmount: number }
  /**
   * Workfare's income band, modeled as its own criterion (rather than a generic
   * individual-income-threshold) because the $500 floor is waivable for specific groups —
   * see the evaluator in src/engine.ts for exactly who qualifies for the waiver.
   */
  | { type: "workfare_income_floor"; standardMinAmount: number; maxAmount: number }
  /** Schemes like ComCare are assessed case-by-case by a social worker — passing
   * the income gate does not guarantee a payout. This criterion always resolves
   * the scheme's outcome to "possibly_eligible_requires_assessment" rather than "eligible". */
  | { type: "discretionary_assessment"; note: string };

export interface MeansTestedTier {
  /** Household qualifies for this tier if its relevant income <= maxAmount. Tiers should be sorted ascending. */
  maxAmount: number;
  amount: number;
}

export interface HouseholdSizeTier {
  /** Household qualifies for this tier if its member count <= maxHouseholdSize. Tiers should be sorted ascending. */
  maxHouseholdSize: number;
  amount: number;
}

export interface SchemeBenefit {
  frequency: Frequency;
  /** Flat amount per `frequency`, used when the scheme does not vary payout by income, household size, or employment type. */
  amount?: number;
  /** Income-banded payout, evaluated against per-capita household income unless noted otherwise in the scheme description. */
  meansTestedTiers?: MeansTestedTier[];
  /** Payout banded by household member count (e.g. ComCare Long-Term Assistance's published rate table). */
  householdSizeTiers?: HouseholdSizeTier[];
  /** Payout that differs by the applicant's employment type (e.g. WIS: employee vs self-employed/platform worker). */
  amountByEmploymentType?: Partial<Record<EmploymentType, number>>;
  /** If true and the household owns more than one property, the lowest amount in `meansTestedTiers` applies regardless of income. */
  multiPropertyCapsToLowestTier?: boolean;
  /**
   * If set, this amount applies instead of `amount`/tiers for the household's first 12 months of
   * enrollment in the scheme (e.g. CTG's $400 first-year grant vs its $200/year top-up
   * thereafter). Only used by estimateCurrentBenefitAmount(), which needs an enrollment date —
   * evaluateEligibility()/estimateBenefitAmount() have no enrollment date and always return the
   * steady-state (non-first-year) amount.
   */
  firstYearAmount?: number;
  /** Free-text caveat about how the real payout mechanics differ from this simplified model (e.g. disbursement cadence, caps). */
  simplificationNote?: string;
}

export interface SchemeDuration {
  timeLimited: boolean;
  /** How often eligibility/amount is reassessed or must be renewed, if applicable. Drives getRenewalStatuses(). */
  renewalCycleMonths?: number;
  reviewNote?: string;
}

export interface SchemeSource {
  url: string;
  lastChecked: string; // ISO date we checked it
  /** The scheme page's own "last updated" date, when published. */
  officialLastUpdated?: string;
  confidence: "placeholder" | "verified";
}

export interface Scheme {
  id: string;
  name: string;
  agency: string;
  description: string;
  eligibility: EligibilityCriterion[];
  benefit: SchemeBenefit;
  duration: SchemeDuration;
  source: SchemeSource;
}

export interface HouseholdMember {
  age: number;
  citizenship: Citizenship;
  employmentType: EmploymentType;
  hasDisability: boolean;
  /**
   * Total CPF contributions made by the time this member turned 55. Only meaningful at 55+;
   * set to 0 below that age or if unknown. Required (not optional) so the engine never has to
   * guess at a missing value — see cpf_contributions_by_55 in src/engine.ts.
   */
  cpfContributionsByAge55: number;
  /** Optional — purely for display ("Parent", "Spouse", etc.). No eligibility criterion reads it. */
  relationship?: Relationship;
}

export interface HouseholdProfile {
  householdId: string;
  /** By convention, members[0] is treated as "the applicant" for applicant-scoped criteria (e.g. WIS income/employment, age). */
  members: HouseholdMember[];
  grossHouseholdMonthlyIncome: number;
  housingType: HousingType;
  annualValueOfHome: number;
  propertyCount: number;
  /** Whether any household member has an official ADL-based or disability care-need certification (used by HCG / CTG / WIS's waiver). */
  hasCertifiedCareNeed: boolean;
  enrolledSchemes: EnrolledScheme[];
  /**
   * Schemes the household applied for and was turned down for — a real-world outcome, distinct
   * from our own computed `EligibilityStatus`. A discretionary scheme (ComCare) can compute as
   * "possibly_eligible_requires_assessment" while the actual caseworker decision was "no" — this
   * field records that decision so the UI/handoff summary don't keep recommending a dead end.
   * Optional (defaults to `[]` wherever read) so every existing HouseholdProfile literal/fixture
   * across the codebase keeps compiling without having to add an empty array everywhere.
   */
  rejectedSchemes?: RejectedScheme[];
}

export interface EnrolledScheme {
  schemeId: string;
  /** ISO date (YYYY-MM-DD) the household first started receiving this scheme. Drives renewal-date and time-varying-benefit calculations. */
  enrollmentDate: string;
  /**
   * What the household says they actually receive, in the scheme's own `benefit.frequency` units
   * — e.g. $300 for a scheme whose formula estimate is $600. Some schemes (ComCare's discretionary
   * sub-schemes especially) don't even have a formula estimate to fall back on, so this is often
   * the only real figure available. Optional: when unset, every display/total falls back to the
   * computed `estimatedBenefitAmount` (see `getReportedAmount()` in src/engine.ts) — the estimate
   * is a reasonable default, not a fiction to be silently preferred over what the household reports.
   */
  actualAmount?: number;
}

export interface RejectedScheme {
  schemeId: string;
  /** ISO date (YYYY-MM-DD) the application was turned down. */
  rejectedDate: string;
  /** Optional free-text reason, if the household knows why (e.g. "income too high", "assessment declined"). */
  note?: string;
}

export type EligibilityStatus = "eligible" | "ineligible" | "possibly_eligible_requires_assessment";

export interface CriterionResult {
  criterion: EligibilityCriterion;
  passed: boolean;
  reason: string;
}

export interface EligibilityResult {
  scheme: Scheme;
  status: EligibilityStatus;
  criteriaResults: CriterionResult[];
  /** Steady-state estimated payout in `scheme.benefit.frequency` units, if status allows a payout estimate. Does not account for firstYearAmount — see estimateCurrentBenefitAmount(). */
  estimatedBenefitAmount: number | null;
}

export type ProfileChange =
  | { type: "income_change"; newGrossHouseholdMonthlyIncome: number }
  | { type: "scheme_expiry"; schemeId: string };

export interface SimulationResult {
  before: EligibilityResult[];
  after: EligibilityResult[];
  gained: Scheme[];
  lost: Scheme[];
  /**
   * Scheme's eligible/ineligible STATUS didn't change. Note this can still hide a real dollar
   * swing: a means-tested scheme the household stays eligible for can move between income tiers
   * (e.g. Silver Support paying more at a lower income band) — that shows up in
   * `netMonthlyDollarImpact`, not in the gained/lost buckets. Check the number, not just the lists.
   */
  unaffected: Scheme[];
  requiresAssessment: Scheme[];
  /** Sum of (after - before) estimated benefit, normalized to a monthly figure. See normalizeToMonthly(). */
  netMonthlyDollarImpact: number;
}

export interface RenewalStatus {
  schemeId: string;
  enrollmentDate: string;
  isTimeLimited: boolean;
  renewalCycleMonths: number | null;
  /** ISO date (YYYY-MM-DD) the scheme is next due for renewal/reassessment, or null if the scheme has no renewal cycle. */
  nextRenewalDate: string | null;
  /** Negative if the renewal date has already passed relative to `asOf`. */
  daysUntilRenewal: number | null;
}

export interface IncomeCliffInfo {
  schemeId: string;
  status: EligibilityStatus;
  incomeBasis: "gross_household" | "per_capita" | null;
  currentIncomeValue: number | null;
  /** Income level (in incomeBasis terms) above which the household loses eligibility entirely, if this scheme has an income ceiling. */
  ineligibilityThreshold: number | null;
  /** ineligibilityThreshold - currentIncomeValue. Negative means the household is already over the line (relevant for "possibly_eligible" schemes where other factors still apply). */
  bufferToIneligibility: number | null;
  /** For means-tested schemes: the income level above which payout drops to the next lower tier. Null if not currently eligible or the scheme isn't tiered. */
  nextTierDropThreshold: number | null;
  bufferToNextTierDrop: number | null;
}
