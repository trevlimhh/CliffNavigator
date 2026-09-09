// Types describing the questions a future UI must ask to populate a HouseholdProfile.
// Kept separate from types.ts (the engine's own data model) because this is UI/collection
// metadata, not something evaluateEligibility() or simulateChange() reads.

export type IntakeInputType = "number" | "boolean" | "select" | "date";

export interface IntakeSelectOption {
  value: string;
  label: string;
}

export interface IntakeField {
  /** Maps to a HouseholdProfile, HouseholdMember, or EnrolledScheme field name of the same id. */
  id: string;
  label: string;
  helpText?: string;
  inputType: IntakeInputType;
  /** Required when inputType is "select". */
  options?: IntakeSelectOption[];
  required: boolean;
  /** Scheme ids whose eligibility evaluation reads this field, directly or via a shared criterion. Lets a form explain "why we're asking". */
  usedBySchemeIds: string[];
  /** Free-text condition for when a form should show this field (e.g. "age >= 55"). Not machine-evaluated by this MVP — a real form layer would implement the check. */
  askWhen?: string;
}
