/**
 * ============================================================================
 * SCHEME DATA — verified against official scheme pages, still needs a final
 * read-through from you before a live demo (see per-scheme simplificationNote
 * / duration.reviewNote fields for exactly what's simplified vs. real).
 * ============================================================================
 * Every scheme below was re-checked on 2026-09-07 against its individual page at
 * supportgowhere.life.gov.sg/schemes/<id> — an initiative run with MSF/MOH/AIC/CPFB, and each
 * of those pages carries its own "Scheme last updated" date (recorded as `officialLastUpdated`
 * below). This replaces an earlier pass of numbers pulled from secondary blog aggregators, two
 * of which were meaningfully wrong (Silver Support's real floor is $215/quarter, not $450;
 * Workfare pays self-employed/platform workers a different amount than employees, which the
 * first pass didn't model at all).
 *
 * `source.confidence` is "verified" where the number came directly off the scheme's own page.
 * It's still "placeholder" wherever the source page itself doesn't publish an exact figure
 * (e.g. ComCare SMTA's payout, Silver Support's and HCG's intermediate tier cutoffs) — those are
 * inherently unpublished/case-by-case, not just unverified by us. Government schemes are revised
 * at every Budget (Feb) and sometimes mid-year, so re-check before a live demo even for
 * "verified" entries if time has passed.
 *
 * KNOWN SIMPLIFICATIONS (see CLAUDE.md for the full list and reasoning):
 * - ComCare is split into two of its three real sub-programs here: Short-to-Medium-Term
 *   Assistance (comcare_smta, fully discretionary) and Long-Term Assistance (comcare_lta,
 *   discretionary eligibility but a published, formula-driven payout by household size).
 *   "Interim Assistance" (a 2026-specific enhanced/time-boxed measure run with the People's
 *   Association) is not modeled as a separate scheme.
 * - Silver Support's real payout also depends on HDB flat type, not just income; this model
 *   tiers by per-capita income only and treats flat type as a pure eligibility gate.
 * - `hasCertifiedCareNeed` is one household-level boolean standing in for two different real
 *   tests: HCG requires an ADL-based assessment (needs help with >= 3 of 6 ADLs); CTG's is
 *   broader (65+ OR an assessed disability). Flattening these into one flag is a deliberate MVP
 *   simplification, not an oversight.
 * - Workfare's $500 income floor is waived for PWDs, ComCare SMTA recipients, and caregivers of
 *   a certified-care-need household member — modeled via the `workfare_income_floor` criterion,
 *   which reads `hasCertifiedCareNeed` as a household-level stand-in for "is a caregiver of a
 *   certified-care-need dependant", and applicant.hasDisability directly.
 */

import type { Scheme } from "../src/types";

const LAST_CHECKED = "2026-09-07";

export const schemes: Scheme[] = [
  {
    id: "comcare_smta",
    name: "ComCare Short-to-Medium-Term Assistance (SMTA)",
    agency: "Ministry of Social and Family Development (MSF)",
    description:
      "Temporary financial assistance for lower-income individuals or families who are temporarily unable to work, " +
      "looking for a job, or earning a low income. Assessed case-by-case by a Social Service Office (SSO).",
    eligibility: [
      { type: "citizenship", required: "pr_or_citizen" },
      { type: "household_income_threshold", basis: "per_capita", maxAmount: 800 },
      {
        type: "discretionary_assessment",
        note:
          "SSO caseworker assesses circumstances holistically (employment, family, finances). The official guidance " +
          "explicitly states households can still apply even above the $800 per-capita guideline if facing financial difficulty.",
      },
    ],
    benefit: {
      frequency: "monthly",
      amount: 500,
      simplificationNote:
        "SMTA's payout is not published anywhere — it depends entirely on the assessed household situation (living " +
        "expenses, rental/utilities support, medical assistance, employment assistance). $500/month is an illustrative " +
        "placeholder only, not a real figure from the scheme page.",
    },
    duration: {
      timeLimited: true,
      renewalCycleMonths: 6,
      reviewNote: "Typically granted in blocks of up to 6 months, renewable subject to reassessment by the SSO.",
    },
    source: {
      url: "https://supportgowhere.life.gov.sg/schemes/COMCARE-SMTA",
      lastChecked: LAST_CHECKED,
      officialLastUpdated: "2026-08-21",
      confidence: "placeholder",
    },
  },
  {
    id: "comcare_lta",
    name: "ComCare Long-Term Assistance (LTA)",
    agency: "Ministry of Social and Family Development (MSF)",
    description:
      "Long-term support for those permanently unable to work due to old age, illness, or disability, with inadequate " +
      "family support or savings. Unlike SMTA, LTA has a published cash-assistance rate table by household size.",
    eligibility: [
      { type: "citizenship", required: "pr_or_citizen" },
      { type: "household_income_threshold", basis: "per_capita", maxAmount: 800 },
      {
        type: "discretionary_assessment",
        note:
          "Requires an assessment that the applicant is permanently unable to work (old age, illness, or disability) " +
          "with inadequate support — the income guideline alone does not determine eligibility, even though the payout " +
          "amount itself is a published formula once approved.",
      },
    ],
    benefit: {
      frequency: "monthly",
      householdSizeTiers: [
        { maxHouseholdSize: 1, amount: 760 },
        { maxHouseholdSize: 2, amount: 1250 },
        { maxHouseholdSize: 3, amount: 1760 },
        { maxHouseholdSize: 4, amount: 2230 },
      ],
      simplificationNote:
        "Rates confirmed from the scheme's official page (increased rates effective April 2025). Published bands stop " +
        "at 4-person households; 5+ person households are capped here at the 4-person rate as an unverified " +
        "placeholder — the real scheme very likely has additional bands not listed on the public page.",
    },
    duration: {
      timeLimited: false,
      renewalCycleMonths: 12,
      reviewNote: "Not fixed-term like SMTA, but periodically reviewed; placeholder 12-month review cycle.",
    },
    source: {
      url: "https://supportgowhere.life.gov.sg/schemes/COMCARE-SMTA",
      lastChecked: LAST_CHECKED,
      officialLastUpdated: "2026-08-21",
      confidence: "verified",
    },
  },
  {
    id: "silver_support",
    name: "Silver Support Scheme",
    agency: "Central Provident Fund Board (CPFB)",
    description:
      "Quarterly cash supplement for lower-income Singaporean seniors, auto-assessed (no application needed).",
    eligibility: [
      { type: "citizenship", required: "citizen" },
      { type: "age", min: 65, appliesTo: "any_household_member" },
      { type: "household_income_threshold", basis: "per_capita", maxAmount: 2300 },
      { type: "housing_type", allowed: ["hdb_1_2_room", "hdb_3_room", "hdb_4_room", "hdb_5_room_or_exec"] },
      { type: "cpf_contributions_by_55", maxAmount: 140000 },
    ],
    benefit: {
      frequency: "quarterly",
      // $1,080 (max) and $215 (min) are confirmed on the scheme's official page. The two
      // intermediate cutoffs/amounts below remain unverified interpolations.
      meansTestedTiers: [
        { maxAmount: 650, amount: 1080 },
        { maxAmount: 1100, amount: 810 },
        { maxAmount: 1700, amount: 500 },
        { maxAmount: 2300, amount: 215 },
      ],
      simplificationNote:
        "Confirmed range is $215-$1,080/quarter (corrected from an earlier, wrong $450 floor pulled from a secondary " +
        "source). Real payout also depends on HDB flat type, not income alone; this model ignores flat type for the " +
        "amount calculation and uses it only as an eligibility gate. Intermediate tier cutoffs ($1,100 / $1,700) and " +
        "their amounts ($810 / $500) are unverified guesses interpolated between the two confirmed endpoints.",
    },
    duration: {
      timeLimited: false,
      renewalCycleMonths: 12,
      reviewNote: "Not time-limited, but income/eligibility is reassessed annually by CPFB.",
    },
    source: {
      url: "https://supportgowhere.life.gov.sg/schemes/SILVERSUPPORT",
      lastChecked: LAST_CHECKED,
      officialLastUpdated: "2026-04-27",
      confidence: "verified",
    },
  },
  {
    id: "workfare_income_supplement",
    name: "Workfare Income Supplement (WIS)",
    agency: "Ministry of Manpower (MOM) / CPF Board",
    description: "Wage supplement for lower-income older or disabled workers, topping up income and CPF savings.",
    eligibility: [
      { type: "citizenship", required: "citizen" },
      { type: "age", min: 30, appliesTo: "applicant" },
      { type: "employment_status", required: "any_working" },
      { type: "workfare_income_floor", standardMinAmount: 500, maxAmount: 3000 },
      { type: "annual_value_threshold", maxAmount: 21000 },
      { type: "property_count", maxCount: 1 },
    ],
    benefit: {
      frequency: "annual",
      amountByEmploymentType: {
        employee: 4900,
        self_employed: 3267,
        platform_worker: 3267,
      },
      simplificationNote:
        "Confirmed from the scheme's official page (Work Year 2025 rates): employees can receive up to $4,900/year " +
        "(40% cash / 60% CPF); self-employed persons and platform workers up to $3,267/year (10% cash / 90% MediSave) " +
        "— a real distinction this model didn't previously make. The official page notes platform workers move to the " +
        "same rate as employees from Work Year 2029 once their CPF contribution rates fully align; not modeled here. " +
        "Both figures are top-of-band amounts (the real schedule is further age-banded for employees); this model does " +
        "not vary the amount by age within the eligible 30+ range.",
    },
    duration: {
      timeLimited: false,
      renewalCycleMonths: 12,
      reviewNote: "Reassessed each work year based on qualifying income; not a fixed-term grant.",
    },
    source: {
      url: "https://supportgowhere.life.gov.sg/schemes/E-WIS",
      lastChecked: LAST_CHECKED,
      officialLastUpdated: "2026-04-27",
      confidence: "verified",
    },
  },
  {
    id: "home_caregiving_grant",
    name: "Home Caregiving Grant (HCG)",
    agency: "Agency for Integrated Care (AIC) / Ministry of Health (MOH)",
    description:
      "Monthly cash grant for households caring at home for a member with a certified moderate-to-severe disability.",
    eligibility: [
      {
        type: "certified_care_need",
        note: "Care recipient must always require some assistance, on a permanent basis, with >= 3 of 6 Activities of Daily Living (ADLs).",
      },
      { type: "household_income_threshold", basis: "per_capita", maxAmount: 4800 },
      { type: "annual_value_threshold", maxAmount: 21000 },
    ],
    benefit: {
      frequency: "monthly",
      // $200 / $400 / $600 tiers and the "$200 for multiple properties" rule are confirmed on the
      // scheme's official page. The exact per-capita income cutoffs between the 3 tiers are NOT
      // published there and remain unverified placeholders below.
      meansTestedTiers: [
        { maxAmount: 1600, amount: 600 },
        { maxAmount: 3200, amount: 400 },
        { maxAmount: 4800, amount: 200 },
      ],
      multiPropertyCapsToLowestTier: true,
      simplificationNote:
        "Confirmed: it's a 3-tier grant ($200/$400/$600 per month), not the 2-tier ($600/$250) guess from an earlier " +
        "pass. Confirmed: households owning multiple properties get the $200 floor regardless of income (now enforced " +
        "via multiPropertyCapsToLowestTier). NOT confirmed: the $1,600 / $3,200 per-capita cutoffs between tiers — AIC's " +
        "page states the overall $4,800 cap and the 3 amounts but not where the bands split; those two cutoffs are " +
        "unverified placeholder guesses.",
    },
    duration: {
      timeLimited: false,
      renewalCycleMonths: 24,
      reviewNote: "Care-need certification is periodically reassessed; placeholder cycle of 24 months.",
    },
    source: {
      url: "https://supportgowhere.life.gov.sg/schemes/HCG",
      lastChecked: LAST_CHECKED,
      officialLastUpdated: "2026-06-15",
      confidence: "verified",
    },
  },
  {
    id: "caregivers_training_grant",
    name: "Caregivers Training Grant (CTG)",
    agency: "Agency for Integrated Care (AIC)",
    description: "Credit to offset the cost of approved caregiver training courses, held as a per-care-recipient balance.",
    eligibility: [
      {
        type: "certified_care_need",
        note: "Care recipient must be a Singapore Citizen/PR aged 65+, OR have a disability assessed by an approved healthcare practitioner (broader test than HCG's ADL-based one).",
      },
    ],
    benefit: {
      frequency: "annual",
      amount: 200,
      firstYearAmount: 400,
      simplificationNote:
        "Confirmed: $400 grant in the first year a household taps CTG, then a $200/year top-up in subsequent years, " +
        "with the total balance capped at $400 at any given time (also a $10 minimum co-payment per course, not " +
        "modeled). This model applies firstYearAmount for the first 12 months since enrollment (see " +
        "estimateCurrentBenefitAmount() in src/engine.ts) and does not simulate the running balance/spend-down or cap.",
    },
    duration: {
      timeLimited: false,
      renewalCycleMonths: 12,
      reviewNote: "Top-up occurs annually as long as the care-need certification remains valid.",
    },
    source: {
      url: "https://supportgowhere.life.gov.sg/schemes/CAREGIVERS_TRAINING",
      lastChecked: LAST_CHECKED,
      officialLastUpdated: "2026-08-27",
      confidence: "verified",
    },
  },
];
