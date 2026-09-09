// Editable draft shapes used by the Intake/Profile confirmation form, and the pure function that
// turns a fully-filled draft into a real HouseholdProfile once the user has confirmed it. Kept
// separate from src/types.ts because these are UI-editing-in-progress shapes (every field
// nullable while the user is still filling gaps), not the engine's own data model.

import type { Citizenship, EmploymentType, EnrolledScheme, HousingType, HouseholdProfile, RejectedScheme, Relationship } from "@/types";
import type { ExtractedProfileFields } from "@/services/intakeExtraction";

export interface DraftMember {
  relationship: Relationship;
  age: number | null;
  citizenship: Citizenship | null;
  employmentType: EmploymentType | null;
  hasDisability: boolean | null;
  cpfContributionsByAge55: number | null;
}

export interface DraftHousehold {
  grossHouseholdMonthlyIncome: number | null;
  housingType: HousingType | null;
  annualValueOfHome: number | null;
  propertyCount: number | null;
  hasCertifiedCareNeed: boolean | null;
  members: DraftMember[];
}

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  self: "You",
  spouse: "Spouse",
  parent: "Parent",
  child: "Child",
  sibling: "Sibling",
  other_relative: "Other relative",
  domestic_helper: "Domestic helper",
  unspecified: "Relationship not set",
};

export function draftFromExtraction(extracted: ExtractedProfileFields): DraftHousehold {
  return {
    grossHouseholdMonthlyIncome: extracted.grossHouseholdMonthlyIncome,
    housingType: extracted.housingType,
    annualValueOfHome: extracted.annualValueOfHome,
    propertyCount: extracted.propertyCount,
    hasCertifiedCareNeed: extracted.hasCertifiedCareNeed,
    members:
      extracted.members.length > 0
        ? extracted.members.map((m) => ({
            relationship: (m.relationshipToApplicant as Relationship) ?? "unspecified",
            age: m.age,
            citizenship: m.citizenship,
            employmentType: m.employmentType,
            hasDisability: m.hasDisability,
            cpfContributionsByAge55: null,
          }))
        : [emptyMember("self")],
  };
}

/** For editing an already-saved profile (Profile page) — the inverse of buildHouseholdProfile(). */
export function draftFromProfile(profile: HouseholdProfile): DraftHousehold {
  return {
    grossHouseholdMonthlyIncome: profile.grossHouseholdMonthlyIncome,
    housingType: profile.housingType,
    annualValueOfHome: profile.annualValueOfHome,
    propertyCount: profile.propertyCount,
    hasCertifiedCareNeed: profile.hasCertifiedCareNeed,
    members: profile.members.map((m, index) => ({
      relationship: index === 0 ? "self" : (m.relationship ?? "unspecified"),
      age: m.age,
      citizenship: m.citizenship,
      employmentType: m.employmentType,
      hasDisability: m.hasDisability,
      cpfContributionsByAge55: m.cpfContributionsByAge55,
    })),
  };
}

export function emptyMember(relationship: Relationship = "unspecified"): DraftMember {
  return { relationship, age: null, citizenship: null, employmentType: null, hasDisability: null, cpfContributionsByAge55: null };
}

export function emptyDraft(): DraftHousehold {
  return {
    grossHouseholdMonthlyIncome: null,
    housingType: null,
    annualValueOfHome: null,
    propertyCount: null,
    hasCertifiedCareNeed: null,
    members: [emptyMember("self")],
  };
}

/** Returns true once every field the engine actually requires is filled in. */
export function isDraftComplete(draft: DraftHousehold): boolean {
  const householdOk =
    draft.grossHouseholdMonthlyIncome !== null &&
    draft.housingType !== null &&
    draft.annualValueOfHome !== null &&
    draft.propertyCount !== null &&
    draft.hasCertifiedCareNeed !== null;

  const membersOk =
    draft.members.length > 0 &&
    draft.members.every((m, index) => {
      const baseOk = m.age !== null && m.citizenship !== null;
      const needsCpfCheck = m.age !== null && m.age >= 55;
      const relationshipOk = index === 0 || m.relationship !== "unspecified";
      return baseOk && relationshipOk && (!needsCpfCheck || m.cpfContributionsByAge55 !== null);
    });

  const applicantOk = draft.members[0]?.employmentType !== null && draft.members[0]?.hasDisability !== null;

  return householdOk && membersOk && applicantOk;
}

export function buildHouseholdProfile(
  draft: DraftHousehold,
  enrolledSchemes: EnrolledScheme[],
  householdId: string,
  rejectedSchemes: RejectedScheme[] = [],
): HouseholdProfile {
  if (!isDraftComplete(draft)) {
    throw new Error("Cannot build a HouseholdProfile from an incomplete draft.");
  }
  return {
    householdId,
    grossHouseholdMonthlyIncome: draft.grossHouseholdMonthlyIncome!,
    housingType: draft.housingType!,
    annualValueOfHome: draft.annualValueOfHome!,
    propertyCount: draft.propertyCount!,
    hasCertifiedCareNeed: draft.hasCertifiedCareNeed!,
    members: draft.members.map((m, index) => ({
      age: m.age!,
      citizenship: m.citizenship!,
      employmentType: index === 0 ? m.employmentType! : (m.employmentType ?? "not_employed"),
      hasDisability: index === 0 ? m.hasDisability! : (m.hasDisability ?? false),
      cpfContributionsByAge55: m.cpfContributionsByAge55 ?? 0,
      relationship: index === 0 ? "self" : m.relationship,
    })),
    enrolledSchemes,
    rejectedSchemes,
  };
}
