import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/services/geminiClient.js", () => ({
  getGeminiClient: vi.fn(),
  EXPLANATION_MODEL: "gemini-3.5-flash",
  toGeminiResponseSchema: vi.fn(() => ({})),
}));

import { getGeminiClient } from "../src/services/geminiClient.js";
import { buildSimulationBriefing, explainSimulationResult } from "../src/services/explanation.js";
import { schemes } from "../data/schemes.js";
import { simulateChange } from "../src/engine.js";
import type { HouseholdProfile } from "../src/types.js";

function makeProfile(overrides: Partial<HouseholdProfile> = {}): HouseholdProfile {
  return {
    householdId: "test-household",
    members: [
      { age: 70, citizenship: "citizen", employmentType: "not_employed", hasDisability: false, cpfContributionsByAge55: 50000 },
    ],
    grossHouseholdMonthlyIncome: 5000,
    housingType: "hdb_3_room",
    annualValueOfHome: 10000,
    propertyCount: 1,
    hasCertifiedCareNeed: false,
    enrolledSchemes: [],
    ...overrides,
  };
}

describe("buildSimulationBriefing", () => {
  it("summarizes gained/lost schemes with their post-change amounts, without leaking full eligibility detail", () => {
    const profile = makeProfile({ grossHouseholdMonthlyIncome: 5000 }); // starts ineligible for Silver Support
    const sim = simulateChange(profile, { type: "income_change", newGrossHouseholdMonthlyIncome: 600 }, schemes);

    const briefing = buildSimulationBriefing(sim, "Household income drops to $600/month");

    expect(briefing.changeDescription).toBe("Household income drops to $600/month");
    const silverSupport = briefing.gainedSchemes.find((s) => s.name.includes("Silver Support"));
    expect(silverSupport).toBeDefined();
    expect(silverSupport!.estimatedAmount).toBe(1080);
    expect(silverSupport!.frequency).toBe("quarterly");
    expect(briefing.netMonthlyDollarImpact).toBe(sim.netMonthlyDollarImpact);
    // No raw criteriaResults or profile fields should leak into the briefing shape.
    expect(briefing).not.toHaveProperty("before");
    expect(briefing).not.toHaveProperty("after");
  });
});

describe("explainSimulationResult", () => {
  const mockGenerateContent = vi.fn();

  beforeEach(() => {
    mockGenerateContent.mockReset();
    vi.mocked(getGeminiClient).mockReturnValue({ models: { generateContent: mockGenerateContent } } as never);
  });

  it("calls Gemini with the explanation model and returns the structured explanation", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        headline: "Cutting your hours could cost you about $150 a month.",
        explanation: "Right now you're just above the line for Silver Support...",
        suggestion: "Consider timing the change after your next CPF review.",
        caveat: "This is a planning estimate, not an official assessment.",
      }),
    });

    const briefing = buildSimulationBriefing(
      simulateChange(makeProfile(), { type: "income_change", newGrossHouseholdMonthlyIncome: 600 }, schemes),
      "Household income drops to $600/month",
    );

    const result = await explainSimulationResult(briefing);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateContent.mock.calls[0]![0];
    expect(callArgs.model).toBe("gemini-3.5-flash");
    expect(callArgs.contents).toContain("Household income drops to $600/month");

    expect(result.headline).toMatch(/cutting your hours/i);
    expect(result.caveat).toMatch(/planning estimate/i);
  });

  it("throws a clear error when Gemini returns no parseable output", async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined });
    const briefing = buildSimulationBriefing(
      simulateChange(makeProfile(), { type: "income_change", newGrossHouseholdMonthlyIncome: 600 }, schemes),
      "test change",
    );
    await expect(explainSimulationResult(briefing)).rejects.toThrow(/did not return a parseable/i);
  });
});
