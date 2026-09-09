// Demo-mode fallbacks used only when GEMINI_API_KEY isn't configured, so the UI can still be
// rehearsed end-to-end without a key. Deliberately simple (regex/keyword matching and templated
// text, not real language understanding) — every API response built from these is marked
// `source: "mock"` so the frontend can show a clear "demo mode" badge rather than presenting
// this as a real AI result.

import { schemes } from "../../data/schemes";
import { computeMissingRequiredFields } from "../services/intakeExtraction";
import type { ExtractedEnrolledScheme, ExtractedMember, ExtractedProfileFields, IntakeExtractionResult } from "../services/intakeExtraction";
import type { ExplanationResult, SimulationBriefing } from "../services/explanation";
import type { Scheme } from "../types";

const SCHEME_ALIASES: Record<string, string[]> = {
  comcare_smta: ["comcare", "com care", "msf assistance"],
  comcare_lta: ["long-term assistance", "long term assistance", " lta"],
  silver_support: ["silver support"],
  workfare_income_supplement: ["workfare", " wis"],
  home_caregiving_grant: ["home caregiving grant", " hcg"],
  caregivers_training_grant: ["caregivers training grant", " ctg", "training grant"],
};

const DEPENDENT_KEYWORDS: { pattern: RegExp; relationship: ExtractedMember["relationshipToApplicant"] }[] = [
  { pattern: /\b(mum|mother|mom)\b/i, relationship: "parent" },
  { pattern: /\b(dad|father)\b/i, relationship: "parent" },
  { pattern: /\b(spouse|husband|wife)\b/i, relationship: "spouse" },
  { pattern: /\b(son|daughter|child|kid)\b/i, relationship: "child" },
];

const CHANGE_KEYWORDS = /\b(thinking of|considering|might|planning to|what if|cutting|reducing|quit|resign)\b/i;

export function mockExtractProfileFromText(freeText: string, catalog: Scheme[] = schemes): IntakeExtractionResult {
  const incomeMatch = freeText.match(/\$\s?([\d,]+)/);
  const grossHouseholdMonthlyIncome = incomeMatch ? Number(incomeMatch[1]!.replace(/,/g, "")) : null;

  const lowerText = freeText.toLowerCase();
  const mentionsCaregiving = /\b(care for|caring for|caregiver|look after)\b/i.test(freeText);

  const members: ExtractedMember[] = [
    { relationshipToApplicant: "self", age: null, citizenship: null, employmentType: null, hasDisability: null },
  ];
  for (const { pattern, relationship } of DEPENDENT_KEYWORDS) {
    if (pattern.test(freeText) && !members.some((m) => m.relationshipToApplicant === relationship)) {
      members.push({ relationshipToApplicant: relationship, age: null, citizenship: null, employmentType: null, hasDisability: null });
    }
  }

  const enrolledSchemes: ExtractedEnrolledScheme[] = [];
  for (const scheme of catalog) {
    const aliases = SCHEME_ALIASES[scheme.id] ?? [];
    if (aliases.some((alias) => lowerText.includes(alias))) {
      enrolledSchemes.push({ schemeId: scheme.id, enrollmentDate: null });
    }
  }

  const extracted: ExtractedProfileFields = {
    grossHouseholdMonthlyIncome,
    housingType: null,
    annualValueOfHome: null,
    propertyCount: null,
    hasCertifiedCareNeed: mentionsCaregiving ? true : null,
    members,
  };

  const mentionsHypotheticalChange = CHANGE_KEYWORDS.test(freeText);
  const sentenceMatch = mentionsHypotheticalChange ? freeText.match(new RegExp(`[^.]*${CHANGE_KEYWORDS.source}[^.]*`, "i")) : null;

  return {
    extracted,
    enrolledSchemes,
    detectedChange: {
      mentionsHypotheticalChange,
      changeDescription: mentionsHypotheticalChange ? (sentenceMatch ? sentenceMatch[0].trim() : "a possible future change") : null,
    },
    assumptions: ["Demo mode: no GEMINI_API_KEY configured — this is a simple keyword-matched extraction, not a real AI result."],
    missingRequiredFields: computeMissingRequiredFields(extracted, enrolledSchemes),
  };
}

export function mockExplainSimulationResult(briefing: SimulationBriefing): ExplanationResult {
  const impact = briefing.netMonthlyDollarImpact;
  const impactStr = `$${Math.abs(impact).toFixed(0)}/month`;
  const headline =
    impact > 0
      ? `This change could gain you about ${impactStr}.`
      : impact < 0
        ? `This change could cost you about ${impactStr}.`
        : "This change doesn't look like it would affect your support.";

  const explanationParts: string[] = [];
  if (briefing.gainedSchemes.length > 0) {
    explanationParts.push(`You'd newly qualify for ${briefing.gainedSchemes.map((s) => s.name).join(", ")}.`);
  }
  if (briefing.lostSchemes.length > 0) {
    explanationParts.push(`You'd lose access to ${briefing.lostSchemes.map((s) => s.name).join(", ")}.`);
  }
  if (briefing.schemesRequiringAssessment.length > 0) {
    explanationParts.push(`${briefing.schemesRequiringAssessment.join(", ")} would need a fresh assessment rather than being automatic.`);
  }
  if (explanationParts.length === 0) {
    explanationParts.push("Your eligibility for the schemes we track doesn't appear to change.");
  }

  return {
    headline,
    explanation: explanationParts.join(" "),
    suggestion:
      briefing.lostSchemes.length > 0
        ? `Consider checking with a Social Service Office before making this change, since ${briefing.lostSchemes[0]!.name} would be affected.`
        : "Consider applying for any newly-eligible schemes as soon as the change takes effect.",
    caveat: "Demo mode: no GEMINI_API_KEY configured — this is a templated summary of the real numbers above, not an AI-written explanation.",
  };
}
