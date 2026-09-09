import { describe, expect, it } from "vitest";
import { schemes } from "../data/schemes.js";
import { evaluateAllSchemes } from "../src/engine.js";
import { formatHandoffSummary } from "../src/lib/formatHandoffSummary.js";
import type { HouseholdProfile } from "../src/types.js";

// With this income ($6200/month, $3100 per-capita), only HCG and CTG pass — HCG via the
// certified-care-need bypass, CTG likewise — every income-tested scheme (ComCare, Silver Support,
// Workfare) is ineligible. The household is enrolled in HCG but not CTG.
const profile: HouseholdProfile = {
  householdId: "test-household",
  members: [
    { age: 45, citizenship: "citizen", employmentType: "employee", hasDisability: false, cpfContributionsByAge55: 0 },
    { age: 75, citizenship: "citizen", employmentType: "not_employed", hasDisability: true, cpfContributionsByAge55: 50000 },
  ],
  grossHouseholdMonthlyIncome: 6200,
  housingType: "hdb_3_room",
  annualValueOfHome: 8000,
  propertyCount: 1,
  hasCertifiedCareNeed: true,
  enrolledSchemes: [{ schemeId: "home_caregiving_grant", enrollmentDate: "2024-01-01" }],
};

describe("formatHandoffSummary", () => {
  const eligibility = evaluateAllSchemes(profile, schemes);
  const summary = formatHandoffSummary(profile, eligibility, new Date("2026-09-08"));

  it("includes household basics and the generation date", () => {
    expect(summary).toContain("Generated: 2026-09-08");
    expect(summary).toContain("Household size: 2");
    expect(summary).toContain("Gross monthly household income: $6200");
  });

  it("lists the enrolled scheme under CURRENTLY ENROLLED with its enrollment date", () => {
    const enrolledSection = summary.split("MAY BE ELIGIBLE FOR")[0];
    expect(enrolledSection).toContain("Home Caregiving Grant (HCG): enrolled since 2024-01-01");
  });

  it("lists a scheme the household is eligible for but not enrolled in only under MAY BE ELIGIBLE FOR", () => {
    const sections = summary.split("MAY BE ELIGIBLE FOR (NOT YET ENROLLED)");
    expect(sections[0]).not.toContain("Caregivers Training Grant");
    expect(sections[1]).toContain("Caregivers Training Grant (CTG): Eligible, not yet enrolled");
  });

  it("never mentions an enrollment date for a scheme the household isn't enrolled in", () => {
    const ctgLine = summary.split("\n").find((line) => line.includes("Caregivers Training Grant"));
    expect(ctgLine).toBeDefined();
    expect(ctgLine).not.toContain("enrolled since");
  });

  it("omits schemes the household is neither enrolled in, eligible for, nor rejected from — no point listing every ineligible scheme", () => {
    expect(summary).not.toContain("Workfare");
    expect(summary).not.toContain("Silver Support");
  });

  it("only counts enrolled schemes toward the total ongoing support figure, not everything eligible for", () => {
    // HCG is enrolled ($400/month); CTG is eligible but not enrolled and must not be counted.
    expect(summary).toContain("Estimated total ongoing support (schemes currently enrolled in, normalized to monthly): ~$400/month");
  });

  it("has no PREVIOUSLY APPLIED section when nothing was rejected", () => {
    expect(summary).not.toContain("PREVIOUSLY APPLIED");
  });

  it("surfaces a rejected scheme under PREVIOUSLY APPLIED — NOT APPROVED, with its reason", () => {
    const profileWithRejection: HouseholdProfile = {
      ...profile,
      rejectedSchemes: [{ schemeId: "comcare_smta", rejectedDate: "2025-06-01", note: "income too high" }],
    };
    const eligibilityWithRejection = evaluateAllSchemes(profileWithRejection, schemes);
    const summaryWithRejection = formatHandoffSummary(profileWithRejection, eligibilityWithRejection, new Date("2026-09-08"));

    expect(summaryWithRejection).toContain("PREVIOUSLY APPLIED — NOT APPROVED");
    expect(summaryWithRejection).toContain("ComCare Short-to-Medium-Term Assistance (SMTA): applied, rejected 2025-06-01 — income too high");
  });

  it("uses the household's self-reported actual amount over the formula estimate, both in the line and the total", () => {
    const profileWithActualAmount: HouseholdProfile = {
      ...profile,
      enrolledSchemes: [{ schemeId: "home_caregiving_grant", enrollmentDate: "2024-01-01", actualAmount: 300 }],
    };
    const eligibilityWithActualAmount = evaluateAllSchemes(profileWithActualAmount, schemes);
    const summaryWithActualAmount = formatHandoffSummary(profileWithActualAmount, eligibilityWithActualAmount, new Date("2026-09-08"));

    expect(summaryWithActualAmount).toContain("Home Caregiving Grant (HCG): enrolled since 2024-01-01 — receiving $300/monthly (est. up to $400)");
    expect(summaryWithActualAmount).toContain("Estimated total ongoing support (schemes currently enrolled in, normalized to monthly): ~$300/month");
  });
});
