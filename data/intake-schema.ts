/**
 * The questions a future UI must ask a caregiver to populate a HouseholdProfile (see
 * src/types.ts) well enough for evaluateEligibility() / simulateChange() / getIncomeCliffs() /
 * getRenewalStatuses() to run. Each field's `id` matches a HouseholdProfile, HouseholdMember, or
 * EnrolledScheme property name of the same name — this is the single source of truth for "what
 * do we need to ask" and "why are we asking it", so the intake form and the engine never drift
 * apart silently.
 *
 * Three groups, matching the three repeating shapes in the data model:
 * - householdIntakeFields:      asked once per household
 * - memberIntakeFields:         asked once per household member (including the applicant)
 * - enrolledSchemeIntakeFields: asked once per scheme the household says it's already enrolled in
 */

import type { IntakeField } from "../src/intakeTypes";

export const householdIntakeFields: IntakeField[] = [
  {
    id: "grossHouseholdMonthlyIncome",
    label: "What is your household's total gross monthly income, combining all members' salaries/wages before deductions?",
    helpText: "Use gross pay, before CPF or tax deductions. Combine every working household member's income.",
    inputType: "number",
    required: true,
    usedBySchemeIds: ["comcare_smta", "comcare_lta", "silver_support", "home_caregiving_grant"],
  },
  {
    id: "housingType",
    label: "What type of home do you currently live in?",
    inputType: "select",
    options: [
      { value: "hdb_1_2_room", label: "HDB 1- or 2-room flat" },
      { value: "hdb_3_room", label: "HDB 3-room flat" },
      { value: "hdb_4_room", label: "HDB 4-room flat" },
      { value: "hdb_5_room_or_exec", label: "HDB 5-room or executive flat" },
      { value: "private_property", label: "Private property (condo, landed, etc.)" },
    ],
    required: true,
    usedBySchemeIds: ["silver_support"],
  },
  {
    id: "annualValueOfHome",
    label: "What is the Annual Value (AV) of your home?",
    helpText: "Free to check at mytax.iras.gov.sg, or find it on your latest property tax bill.",
    inputType: "number",
    required: true,
    usedBySchemeIds: ["workfare_income_supplement", "home_caregiving_grant"],
  },
  {
    id: "propertyCount",
    label: "How many properties do you (and your spouse, if married) own in total, in Singapore or overseas?",
    inputType: "number",
    required: true,
    usedBySchemeIds: ["workfare_income_supplement", "silver_support", "home_caregiving_grant"],
  },
  {
    id: "hasCertifiedCareNeed",
    label:
      "Does anyone in your household have an officially certified care need — assessed as needing help with at least 3 of 6 Activities of Daily Living (ADLs), or a disability certified by a doctor?",
    helpText:
      "The 6 ADLs are: eating, bathing, dressing, transferring, toileting, and walking/moving around. This is usually " +
      "certified by AIC or a healthcare professional, not just self-assessed.",
    inputType: "boolean",
    required: true,
    usedBySchemeIds: ["home_caregiving_grant", "caregivers_training_grant", "workfare_income_supplement"],
  },
];

export const memberIntakeFields: IntakeField[] = [
  {
    id: "age",
    label: "What is this person's age?",
    inputType: "number",
    required: true,
    usedBySchemeIds: ["silver_support", "workfare_income_supplement", "caregivers_training_grant"],
  },
  {
    id: "citizenship",
    label: "What is this person's citizenship status?",
    inputType: "select",
    options: [
      { value: "citizen", label: "Singapore Citizen" },
      { value: "pr", label: "Permanent Resident" },
      { value: "other", label: "Other / none of the above" },
    ],
    required: true,
    usedBySchemeIds: ["comcare_smta", "comcare_lta", "silver_support", "workfare_income_supplement", "caregivers_training_grant"],
  },
  {
    id: "employmentType",
    label: "What is this person's current work status?",
    inputType: "select",
    options: [
      { value: "employee", label: "Employee (drawing a salary)" },
      { value: "self_employed", label: "Self-employed" },
      { value: "platform_worker", label: "Platform worker (e.g. delivery rider, private-hire driver)" },
      { value: "not_employed", label: "Not currently working" },
    ],
    required: true,
    usedBySchemeIds: ["workfare_income_supplement"],
    askWhen: "isApplicant",
  },
  {
    id: "hasDisability",
    label: "Does this person have a disability?",
    inputType: "boolean",
    required: true,
    usedBySchemeIds: ["workfare_income_supplement"],
    askWhen: "isApplicant",
  },
  {
    id: "cpfContributionsByAge55",
    label: "Approximately how much in total CPF contributions had this person made by age 55?",
    helpText: "Only relevant for Silver Support if this person is 65 or older. Enter 0 if not applicable or unknown.",
    inputType: "number",
    required: true,
    askWhen: "age >= 55",
    usedBySchemeIds: ["silver_support"],
  },
];

export const enrolledSchemeIntakeFields: IntakeField[] = [
  {
    id: "enrollmentDate",
    label: "When did your household first start receiving this scheme?",
    helpText:
      "Used to work out when a time-limited scheme is next due for renewal, and for schemes whose payout changes " +
      "the longer you've been enrolled (e.g. the Caregivers Training Grant's first-year vs. later-year amount).",
    inputType: "date",
    required: true,
    usedBySchemeIds: ["comcare_smta", "comcare_lta", "silver_support", "home_caregiving_grant", "caregivers_training_grant"],
  },
];
