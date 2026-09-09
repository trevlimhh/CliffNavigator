import { describe, expect, it } from "vitest";
import { schemes } from "../data/schemes.js";
import {
  compareProfiles,
  estimateCurrentBenefitAmount,
  evaluateEligibility,
  getIncomeCliffs,
  getPerCapitaMonthlyIncome,
  getRenewalStatuses,
  getReportedAmount,
  normalizeToMonthly,
  simulateChange,
} from "../src/engine.js";
import type { HouseholdProfile } from "../src/types.js";

const scheme = (id: string) => {
  const found = schemes.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown scheme id in test fixture: ${id}`);
  return found;
};

function makeProfile(overrides: Partial<HouseholdProfile> = {}): HouseholdProfile {
  return {
    householdId: "test-household",
    members: [{ age: 58, citizenship: "citizen", employmentType: "employee", hasDisability: false, cpfContributionsByAge55: 0 }],
    grossHouseholdMonthlyIncome: 2600,
    housingType: "hdb_4_room",
    annualValueOfHome: 10000,
    propertyCount: 1,
    hasCertifiedCareNeed: false,
    enrolledSchemes: [],
    ...overrides,
  };
}

describe("getPerCapitaMonthlyIncome", () => {
  it("divides gross household income by household size", () => {
    const profile = makeProfile({
      grossHouseholdMonthlyIncome: 3000,
      members: [
        { age: 40, citizenship: "citizen", employmentType: "employee", hasDisability: false, cpfContributionsByAge55: 0 },
        { age: 10, citizenship: "citizen", employmentType: "not_employed", hasDisability: false, cpfContributionsByAge55: 0 },
      ],
    });
    expect(getPerCapitaMonthlyIncome(profile)).toBe(1500);
  });
});

describe("normalizeToMonthly", () => {
  it("passes monthly amounts through unchanged", () => {
    expect(normalizeToMonthly(600, "monthly")).toBe(600);
  });
  it("divides quarterly amounts by 3", () => {
    expect(normalizeToMonthly(1080, "quarterly")).toBeCloseTo(360);
  });
  it("divides annual amounts by 12", () => {
    expect(normalizeToMonthly(4900, "annual")).toBeCloseTo(408.33, 1);
  });
  it("treats one-time amounts as $0/month by policy", () => {
    expect(normalizeToMonthly(200, "one_time")).toBe(0);
  });
});

describe("getReportedAmount", () => {
  it("falls back to the computed estimate when no actualAmount is on file", () => {
    const profile = makeProfile({ hasCertifiedCareNeed: true, enrolledSchemes: [{ schemeId: "home_caregiving_grant", enrollmentDate: "2024-01-01" }] });
    const result = evaluateEligibility(scheme("home_caregiving_grant"), profile);
    expect(getReportedAmount(result, profile.enrolledSchemes[0])).toBe(result.estimatedBenefitAmount);
  });

  it("prefers the household's self-reported actualAmount over the formula estimate", () => {
    const profile = makeProfile({
      hasCertifiedCareNeed: true,
      enrolledSchemes: [{ schemeId: "home_caregiving_grant", enrollmentDate: "2024-01-01", actualAmount: 300 }],
    });
    const result = evaluateEligibility(scheme("home_caregiving_grant"), profile);
    expect(result.estimatedBenefitAmount).not.toBe(300); // sanity: the formula estimate really does differ
    expect(getReportedAmount(result, profile.enrolledSchemes[0])).toBe(300);
  });

  it("returns null when neither an actualAmount nor a computed estimate is available", () => {
    const profile = makeProfile({ enrolledSchemes: [{ schemeId: "comcare_smta", enrollmentDate: "2024-01-01" }] });
    const result = evaluateEligibility(scheme("comcare_smta"), profile);
    expect(result.estimatedBenefitAmount).toBeNull(); // discretionary — no formula estimate
    expect(getReportedAmount(result, profile.enrolledSchemes[0])).toBeNull();
  });

  it("returns the computed estimate when the scheme isn't enrolled at all (no EnrolledScheme record)", () => {
    const profile = makeProfile({ hasCertifiedCareNeed: true });
    const result = evaluateEligibility(scheme("home_caregiving_grant"), profile);
    expect(getReportedAmount(result, undefined)).toBe(result.estimatedBenefitAmount);
  });
});

describe("evaluateEligibility — Silver Support Scheme", () => {
  const silverSupport = scheme("silver_support");
  const elderlyMember = (overrides: Partial<HouseholdProfile["members"][number]> = {}) => ({
    age: 70,
    citizenship: "citizen" as const,
    employmentType: "not_employed" as const,
    hasDisability: false,
    cpfContributionsByAge55: 50000,
    ...overrides,
  });

  it("is eligible for a low-income elderly SC household in an eligible HDB flat under the CPF cap", () => {
    const profile = makeProfile({
      members: [elderlyMember()],
      grossHouseholdMonthlyIncome: 600,
      housingType: "hdb_3_room",
    });
    const result = evaluateEligibility(silverSupport, profile);
    expect(result.status).toBe("eligible");
    expect(result.estimatedBenefitAmount).toBe(1080); // top tier at <= $650 per capita
  });

  it("is ineligible when CPF contributions by 55 exceed the cap, even if otherwise qualifying", () => {
    const profile = makeProfile({
      members: [elderlyMember({ cpfContributionsByAge55: 200000 })],
      grossHouseholdMonthlyIncome: 600,
    });
    const result = evaluateEligibility(silverSupport, profile);
    expect(result.status).toBe("ineligible");
  });

  it("is ineligible when no household member meets the age-65 gate", () => {
    const profile = makeProfile({
      members: [{ age: 50, citizenship: "citizen", employmentType: "employee", hasDisability: false, cpfContributionsByAge55: 0 }],
      grossHouseholdMonthlyIncome: 600,
    });
    const result = evaluateEligibility(silverSupport, profile);
    expect(result.status).toBe("ineligible");
    expect(result.estimatedBenefitAmount).toBeNull();
  });

  it("is ineligible when per-capita income exceeds the cap even if elderly", () => {
    const profile = makeProfile({ members: [elderlyMember()], grossHouseholdMonthlyIncome: 5000 });
    const result = evaluateEligibility(silverSupport, profile);
    expect(result.status).toBe("ineligible");
  });

  it("is ineligible for private property regardless of income", () => {
    const profile = makeProfile({
      members: [elderlyMember()],
      grossHouseholdMonthlyIncome: 600,
      housingType: "private_property",
    });
    const result = evaluateEligibility(silverSupport, profile);
    expect(result.status).toBe("ineligible");
  });
});

describe("evaluateEligibility — Workfare Income Supplement", () => {
  const wis = scheme("workfare_income_supplement");
  const worker = (overrides: Partial<HouseholdProfile["members"][number]> = {}) => ({
    age: 45,
    citizenship: "citizen" as const,
    employmentType: "employee" as const,
    hasDisability: false,
    cpfContributionsByAge55: 0,
    ...overrides,
  });

  it("is ineligible below the minimum applicant age of 30", () => {
    const profile = makeProfile({ members: [worker({ age: 25 })], grossHouseholdMonthlyIncome: 1800 });
    expect(evaluateEligibility(wis, profile).status).toBe("ineligible");
  });

  it("is ineligible for an applicant who is not working", () => {
    const profile = makeProfile({ members: [worker({ employmentType: "not_employed" })], grossHouseholdMonthlyIncome: 1800 });
    expect(evaluateEligibility(wis, profile).status).toBe("ineligible");
  });

  it("is eligible for a qualifying employee and pays the employee rate", () => {
    const profile = makeProfile({ members: [worker()], grossHouseholdMonthlyIncome: 1800 });
    const result = evaluateEligibility(wis, profile);
    expect(result.status).toBe("eligible");
    expect(result.estimatedBenefitAmount).toBe(4900);
  });

  it("pays the lower self-employed/platform-worker rate for a self-employed applicant", () => {
    const profile = makeProfile({ members: [worker({ employmentType: "self_employed" })], grossHouseholdMonthlyIncome: 1800 });
    const result = evaluateEligibility(wis, profile);
    expect(result.status).toBe("eligible");
    expect(result.estimatedBenefitAmount).toBe(3267);
  });

  it("is ineligible below the $500 income floor with no waiver", () => {
    const profile = makeProfile({ members: [worker()], grossHouseholdMonthlyIncome: 400, hasCertifiedCareNeed: false });
    expect(evaluateEligibility(wis, profile).status).toBe("ineligible");
  });

  it("waives the $500 income floor for a caregiver of a certified-care-need household member", () => {
    const profile = makeProfile({ members: [worker()], grossHouseholdMonthlyIncome: 400, hasCertifiedCareNeed: true });
    expect(evaluateEligibility(wis, profile).status).toBe("eligible");
  });

  it("waives the $500 income floor for an applicant with a disability", () => {
    const profile = makeProfile({ members: [worker({ hasDisability: true })], grossHouseholdMonthlyIncome: 400 });
    expect(evaluateEligibility(wis, profile).status).toBe("eligible");
  });

  it("is ineligible when the household owns more than one property", () => {
    const profile = makeProfile({ members: [worker()], grossHouseholdMonthlyIncome: 1800, propertyCount: 2 });
    expect(evaluateEligibility(wis, profile).status).toBe("ineligible");
  });
});

describe("evaluateEligibility — ComCare (SMTA and LTA, discretionary)", () => {
  const smta = scheme("comcare_smta");
  const lta = scheme("comcare_lta");

  it("SMTA resolves to possibly_eligible_requires_assessment rather than a hard eligible, even when the income gate passes", () => {
    const profile = makeProfile({ grossHouseholdMonthlyIncome: 600 });
    expect(evaluateEligibility(smta, profile).status).toBe("possibly_eligible_requires_assessment");
  });

  it("SMTA is ineligible outright when the income gate fails", () => {
    const profile = makeProfile({ grossHouseholdMonthlyIncome: 5000 });
    expect(evaluateEligibility(smta, profile).status).toBe("ineligible");
  });

  it("LTA estimates a household-size-banded payout when the income gate passes", () => {
    const profile = makeProfile({
      grossHouseholdMonthlyIncome: 600,
      members: [
        { age: 70, citizenship: "citizen", employmentType: "not_employed", hasDisability: false, cpfContributionsByAge55: 0 },
        { age: 40, citizenship: "citizen", employmentType: "employee", hasDisability: false, cpfContributionsByAge55: 0 },
      ],
    });
    const result = evaluateEligibility(lta, profile);
    expect(result.status).toBe("possibly_eligible_requires_assessment");
    expect(result.estimatedBenefitAmount).toBe(1250); // 2-person household band
  });
});

describe("evaluateEligibility — Home Caregiving Grant & Caregivers Training Grant", () => {
  const hcg = scheme("home_caregiving_grant");
  const ctg = scheme("caregivers_training_grant");

  it("requires a certified care need regardless of income", () => {
    const profile = makeProfile({ grossHouseholdMonthlyIncome: 600, hasCertifiedCareNeed: false });
    expect(evaluateEligibility(hcg, profile).status).toBe("ineligible");
    expect(evaluateEligibility(ctg, profile).status).toBe("ineligible");
  });

  it("is eligible once a certified care need is present and income qualifies for the top tier", () => {
    const profile = makeProfile({ grossHouseholdMonthlyIncome: 1000, hasCertifiedCareNeed: true });
    const result = evaluateEligibility(hcg, profile);
    expect(result.status).toBe("eligible");
    expect(result.estimatedBenefitAmount).toBe(600); // <= $1,600 per-capita placeholder tier
  });

  it("caps at the lowest tier for households owning multiple properties, regardless of income", () => {
    const profile = makeProfile({ grossHouseholdMonthlyIncome: 1000, hasCertifiedCareNeed: true, propertyCount: 2 });
    const result = evaluateEligibility(hcg, profile);
    expect(result.status).toBe("eligible");
    expect(result.estimatedBenefitAmount).toBe(200);
  });
});

describe("estimateCurrentBenefitAmount — CTG first-year vs subsequent amount", () => {
  const ctg = scheme("caregivers_training_grant");
  const profile = makeProfile({ hasCertifiedCareNeed: true });

  it("returns the first-year amount within 12 months of enrollment", () => {
    const amount = estimateCurrentBenefitAmount(ctg, profile, "2026-06-01", new Date("2026-09-01"));
    expect(amount).toBe(400);
  });

  it("falls back to the steady-state amount after the first 12 months", () => {
    const amount = estimateCurrentBenefitAmount(ctg, profile, "2024-06-01", new Date("2026-09-01"));
    expect(amount).toBe(200);
  });
});

describe("simulateChange — income_change", () => {
  const elderlyMember = { age: 70, citizenship: "citizen" as const, employmentType: "not_employed" as const, hasDisability: false, cpfContributionsByAge55: 50000 };

  it("surfaces a newly gained scheme and a positive net dollar impact when income drops sharply", () => {
    const profile = makeProfile({
      members: [elderlyMember],
      grossHouseholdMonthlyIncome: 5000, // starts ineligible for Silver Support
      housingType: "hdb_3_room",
    });

    const sim = simulateChange(profile, { type: "income_change", newGrossHouseholdMonthlyIncome: 600 }, schemes);

    expect(sim.gained.map((s) => s.id)).toContain("silver_support");
    expect(sim.lost).toHaveLength(0);
    expect(sim.netMonthlyDollarImpact).toBeGreaterThan(0);
  });

  it("surfaces a lost scheme and a negative net dollar impact when income rises above a threshold", () => {
    const profile = makeProfile({
      members: [elderlyMember],
      grossHouseholdMonthlyIncome: 600,
      housingType: "hdb_3_room",
    });

    const sim = simulateChange(profile, { type: "income_change", newGrossHouseholdMonthlyIncome: 5000 }, schemes);

    expect(sim.lost.map((s) => s.id)).toContain("silver_support");
    expect(sim.netMonthlyDollarImpact).toBeLessThan(0);
  });
});

describe("simulateChange — scheme_expiry", () => {
  it("marks the expired scheme as lost and reduces net monthly impact by its estimated value, leaving other schemes unaffected", () => {
    const profile = makeProfile({
      grossHouseholdMonthlyIncome: 1000,
      hasCertifiedCareNeed: true,
      enrolledSchemes: [{ schemeId: "home_caregiving_grant", enrollmentDate: "2024-01-01" }],
    });

    const sim = simulateChange(profile, { type: "scheme_expiry", schemeId: "home_caregiving_grant" }, schemes);

    expect(sim.lost.map((s) => s.id)).toEqual(["home_caregiving_grant"]);
    expect(sim.gained).toHaveLength(0);
    expect(sim.netMonthlyDollarImpact).toBeCloseTo(-600);
  });

  it("is a no-op when the household was not actually enrolled in the expiring scheme", () => {
    const profile = makeProfile({
      grossHouseholdMonthlyIncome: 1000,
      hasCertifiedCareNeed: true,
      enrolledSchemes: [], // eligible on paper, but not actually enrolled/receiving it
    });

    const sim = simulateChange(profile, { type: "scheme_expiry", schemeId: "home_caregiving_grant" }, schemes);

    expect(sim.lost).toHaveLength(0);
    expect(sim.netMonthlyDollarImpact).toBe(0);
  });
});

describe("compareProfiles", () => {
  it("produces the same gained/lost/impact result as simulateChange for an equivalent income change", () => {
    const oldProfile = makeProfile({ grossHouseholdMonthlyIncome: 5000 });
    const newProfile = { ...oldProfile, grossHouseholdMonthlyIncome: 600 };

    const viaCompare = compareProfiles(oldProfile, newProfile, schemes);
    const viaSimulate = simulateChange(oldProfile, { type: "income_change", newGrossHouseholdMonthlyIncome: 600 }, schemes);

    expect(viaCompare.gained.map((s) => s.id)).toEqual(viaSimulate.gained.map((s) => s.id));
    expect(viaCompare.lost.map((s) => s.id)).toEqual(viaSimulate.lost.map((s) => s.id));
    expect(viaCompare.netMonthlyDollarImpact).toBe(viaSimulate.netMonthlyDollarImpact);
  });

  it("detects a change unrelated to income or scheme expiry, e.g. a newly certified care need", () => {
    const oldProfile = makeProfile({ hasCertifiedCareNeed: false, grossHouseholdMonthlyIncome: 1000 });
    const newProfile = { ...oldProfile, hasCertifiedCareNeed: true };

    const result = compareProfiles(oldProfile, newProfile, schemes);

    expect(result.gained.map((s) => s.id)).toContain("home_caregiving_grant");
    expect(result.gained.map((s) => s.id)).toContain("caregivers_training_grant");
    expect(result.netMonthlyDollarImpact).toBeGreaterThan(0);
  });
});

describe("getRenewalStatuses", () => {
  it("computes the next renewal date from enrollment date + renewalCycleMonths", () => {
    const profile = makeProfile({
      hasCertifiedCareNeed: true,
      enrolledSchemes: [{ schemeId: "caregivers_training_grant", enrollmentDate: "2026-01-15" }],
    });
    const [status] = getRenewalStatuses(profile, schemes, new Date("2026-09-07"));
    expect(status!.nextRenewalDate).toBe("2027-01-15"); // 12-month cycle
    expect(status!.daysUntilRenewal).toBeGreaterThan(0);
  });

  it("reports a negative daysUntilRenewal when the renewal date has passed", () => {
    const profile = makeProfile({
      enrolledSchemes: [{ schemeId: "comcare_smta", enrollmentDate: "2026-01-01" }], // 6-month cycle -> due 2026-07-01
    });
    const [status] = getRenewalStatuses(profile, schemes, new Date("2026-09-07"));
    expect(status!.daysUntilRenewal).toBeLessThan(0);
  });

  it("throws if enrolled in an unknown scheme id", () => {
    const profile = makeProfile({ enrolledSchemes: [{ schemeId: "not_a_real_scheme", enrollmentDate: "2026-01-01" }] });
    expect(() => getRenewalStatuses(profile, schemes)).toThrow();
  });
});

describe("getIncomeCliffs", () => {
  it("reports the buffer to ineligibility and to the next tier drop for a means-tested scheme", () => {
    const profile = makeProfile({
      members: [{ age: 70, citizenship: "citizen", employmentType: "not_employed", hasDisability: false, cpfContributionsByAge55: 50000 }],
      grossHouseholdMonthlyIncome: 600, // per-capita 600, within the <=650 top Silver Support tier
      housingType: "hdb_3_room",
    });
    const cliffs = getIncomeCliffs(profile, schemes);
    const silverSupportCliff = cliffs.find((c) => c.schemeId === "silver_support")!;

    expect(silverSupportCliff.incomeBasis).toBe("per_capita");
    expect(silverSupportCliff.currentIncomeValue).toBe(600);
    expect(silverSupportCliff.ineligibilityThreshold).toBe(2300);
    expect(silverSupportCliff.bufferToIneligibility).toBe(1700);
    expect(silverSupportCliff.nextTierDropThreshold).toBe(650); // exceeding this drops out of the $1,080 tier
    expect(silverSupportCliff.bufferToNextTierDrop).toBe(50);
  });

  it("reports null thresholds for a scheme with no income ceiling in the model", () => {
    const profile = makeProfile({ hasCertifiedCareNeed: true });
    const cliffs = getIncomeCliffs(profile, schemes);
    const ctgCliff = cliffs.find((c) => c.schemeId === "caregivers_training_grant")!;
    expect(ctgCliff.incomeBasis).toBeNull();
    expect(ctgCliff.ineligibilityThreshold).toBeNull();
  });
});
