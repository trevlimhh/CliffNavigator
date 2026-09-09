import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ExtractedEnrolledScheme, ExtractedProfileFields } from "../src/services/intakeExtraction.js";

// Mock the one module allowed to touch the Gemini SDK, so this test never needs a real API key.
vi.mock("../src/services/geminiClient.js", () => ({
  getGeminiClient: vi.fn(),
  EXTRACTION_MODEL: "gemini-3.5-flash-lite",
  toGeminiResponseSchema: vi.fn(() => ({})),
}));

import { getGeminiClient } from "../src/services/geminiClient.js";
import { computeMissingRequiredFields, extractProfileFromText } from "../src/services/intakeExtraction.js";

function baseExtracted(overrides: Partial<ExtractedProfileFields> = {}): ExtractedProfileFields {
  return {
    grossHouseholdMonthlyIncome: 2400,
    housingType: "hdb_4_room",
    annualValueOfHome: null,
    propertyCount: null,
    hasCertifiedCareNeed: null,
    members: [{ relationshipToApplicant: "self", age: 45, citizenship: "citizen", employmentType: "employee", hasDisability: false }],
    ...overrides,
  };
}

describe("computeMissingRequiredFields", () => {
  it("flags unset required household fields", () => {
    const missing = computeMissingRequiredFields(baseExtracted(), []);
    expect(missing).toContain("annualValueOfHome");
    expect(missing).toContain("propertyCount");
    expect(missing).toContain("hasCertifiedCareNeed");
    expect(missing).not.toContain("grossHouseholdMonthlyIncome");
    expect(missing).not.toContain("housingType");
  });

  it("does not flag employmentType/hasDisability for a non-applicant member", () => {
    const extracted = baseExtracted({
      members: [
        { relationshipToApplicant: "self", age: 45, citizenship: "citizen", employmentType: "employee", hasDisability: false },
        { relationshipToApplicant: "parent", age: null, citizenship: null, employmentType: null, hasDisability: null },
      ],
    });
    const missing = computeMissingRequiredFields(extracted, []);
    expect(missing).not.toContain("members[1].employmentType");
    expect(missing).not.toContain("members[1].hasDisability");
    expect(missing).toContain("members[1].age");
    expect(missing).toContain("members[1].citizenship");
  });

  it("only flags cpfContributionsByAge55 when age is known and >= 55", () => {
    const under55 = baseExtracted({ members: [{ relationshipToApplicant: "self", age: 40, citizenship: "citizen", employmentType: "employee", hasDisability: false }] });
    expect(computeMissingRequiredFields(under55, [])).not.toContain("members[0].cpfContributionsByAge55");

    const over55 = baseExtracted({ members: [{ relationshipToApplicant: "self", age: 70, citizenship: "citizen", employmentType: "not_employed", hasDisability: false }] });
    expect(computeMissingRequiredFields(over55, [])).toContain("members[0].cpfContributionsByAge55");
  });

  it("flags a missing enrollmentDate for an enrolled scheme", () => {
    const enrolled: ExtractedEnrolledScheme[] = [{ schemeId: "comcare_smta", enrollmentDate: null }];
    const missing = computeMissingRequiredFields(baseExtracted({ hasCertifiedCareNeed: false, annualValueOfHome: 10000, propertyCount: 1 }), enrolled);
    expect(missing).toContain("enrolledSchemes[0].enrollmentDate");
  });

  it("flags 'members' when no members were extracted at all", () => {
    const missing = computeMissingRequiredFields(baseExtracted({ members: [] }), []);
    expect(missing).toContain("members");
  });
});

describe("extractProfileFromText", () => {
  const mockGenerateContent = vi.fn();

  beforeEach(() => {
    mockGenerateContent.mockReset();
    vi.mocked(getGeminiClient).mockReturnValue({ models: { generateContent: mockGenerateContent } } as never);
  });

  it("calls Gemini with the extraction model and returns computed missingRequiredFields", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        extracted: baseExtracted({ hasCertifiedCareNeed: true }),
        enrolledSchemes: [{ schemeId: "comcare_smta", enrollmentDate: null }],
        detectedChange: { mentionsHypotheticalChange: true, changeDescription: "cutting to part-time work" },
        assumptions: ["assumed 'mum' is the care recipient"],
      }),
    });

    const result = await extractProfileFromText("I care for my mum, household income is $2,400, I'm on ComCare, thinking of cutting to part-time work");

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateContent.mock.calls[0]![0];
    expect(callArgs.model).toBe("gemini-3.5-flash-lite");
    expect(callArgs.contents).toContain("cutting to part-time work");

    expect(result.detectedChange.mentionsHypotheticalChange).toBe(true);
    expect(result.assumptions).toHaveLength(1);
    expect(result.missingRequiredFields).toContain("annualValueOfHome");
    expect(result.missingRequiredFields).toContain("enrolledSchemes[0].enrollmentDate");
  });

  it("throws a clear error when Gemini returns no parseable output", async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined });
    await expect(extractProfileFromText("some text")).rejects.toThrow(/did not return a parseable/i);
  });

  it("throws a clear error when Gemini's JSON doesn't match the expected schema", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ nonsense: true }) });
    await expect(extractProfileFromText("some text")).rejects.toThrow(/did not return a parseable/i);
  });
});
