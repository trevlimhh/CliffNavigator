import { describe, expect, it } from "vitest";
import { schemes } from "../data/schemes.js";
import { evaluateAllSchemes } from "../src/engine.js";
import { detectEligibilityChangeNotifications, detectRenewalNotifications } from "../src/lib/notificationEngine.js";
import type { HouseholdProfile } from "../src/types.js";

function makeProfile(overrides: Partial<HouseholdProfile> = {}): HouseholdProfile {
  return {
    householdId: "test-household",
    members: [{ age: 45, citizenship: "citizen", employmentType: "employee", hasDisability: false, cpfContributionsByAge55: 0 }],
    grossHouseholdMonthlyIncome: 1000,
    housingType: "hdb_3_room",
    annualValueOfHome: 8000,
    propertyCount: 1,
    hasCertifiedCareNeed: true,
    enrolledSchemes: [],
    ...overrides,
  };
}

describe("detectRenewalNotifications", () => {
  it("flags an overdue renewal", () => {
    const profile = makeProfile({ enrolledSchemes: [{ schemeId: "comcare_smta", enrollmentDate: "2026-01-01" }] }); // 6-month cycle -> due 2026-07-01
    const drafts = detectRenewalNotifications(profile, schemes, new Date("2026-09-07"));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe("renewal_overdue");
    expect(drafts[0]!.schemeId).toBe("comcare_smta");
  });

  it("flags a renewal due within the warning window but not one that's far off", () => {
    const profile = makeProfile({
      enrolledSchemes: [{ schemeId: "caregivers_training_grant", enrollmentDate: "2025-09-20" }], // 12-month cycle -> due 2026-09-20
    });
    const drafts = detectRenewalNotifications(profile, schemes, new Date("2026-09-07")); // 13 days out
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe("renewal_due");
  });

  it("does not flag a renewal that's far in the future", () => {
    const profile = makeProfile({ enrolledSchemes: [{ schemeId: "caregivers_training_grant", enrollmentDate: "2026-08-01" }] });
    const drafts = detectRenewalNotifications(profile, schemes, new Date("2026-09-07"));
    expect(drafts).toHaveLength(0);
  });
});

describe("detectEligibilityChangeNotifications", () => {
  it("returns nothing when there's no prior snapshot", () => {
    const profile = makeProfile();
    const current = evaluateAllSchemes(profile, schemes);
    expect(detectEligibilityChangeNotifications([], current)).toHaveLength(0);
  });

  it("flags a scheme newly lost since the last snapshot", () => {
    const profile = makeProfile({ grossHouseholdMonthlyIncome: 6200 }); // now over every income ceiling
    const current = evaluateAllSchemes(profile, schemes);
    const previous = current.map((r) => ({ schemeId: r.scheme.id, status: r.scheme.id === "workfare_income_supplement" ? ("eligible" as const) : r.status }));

    const drafts = detectEligibilityChangeNotifications(previous, current);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe("eligibility_lost");
    expect(drafts[0]!.schemeId).toBe("workfare_income_supplement");
  });

  it("flags a scheme newly gained since the last snapshot", () => {
    const profile = makeProfile({
      grossHouseholdMonthlyIncome: 600,
      members: [{ age: 70, citizenship: "citizen", employmentType: "not_employed", hasDisability: false, cpfContributionsByAge55: 50000 }],
    });
    const current = evaluateAllSchemes(profile, schemes); // silver_support is genuinely eligible here
    const previous = current.map((r) => ({ schemeId: r.scheme.id, status: r.scheme.id === "silver_support" ? ("ineligible" as const) : r.status }));

    const drafts = detectEligibilityChangeNotifications(previous, current);
    const silverSupportDraft = drafts.find((d) => d.schemeId === "silver_support");
    expect(silverSupportDraft?.type).toBe("eligibility_gained");
  });
});
