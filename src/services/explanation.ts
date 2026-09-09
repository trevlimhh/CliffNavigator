// Gemini 2.5 Flash: turns a SimulationResult into a warm, plain-language explanation with one
// concrete next step. The model never sees the raw SimulationResult or HouseholdProfile —
// buildSimulationBriefing() pre-formats a small, PII-minimal summary first. That function is pure
// and exported so it's unit-testable without touching the API.

import { z } from "zod";
import { getGeminiClient, EXPLANATION_MODEL, toGeminiResponseSchema } from "./geminiClient";
import type { Frequency, SimulationResult } from "../types";

export interface SchemeImpactSummary {
  name: string;
  estimatedAmount: number | null;
  frequency: Frequency;
}

export interface SimulationBriefing {
  changeDescription: string;
  gainedSchemes: SchemeImpactSummary[];
  lostSchemes: SchemeImpactSummary[];
  schemesRequiringAssessment: string[];
  netMonthlyDollarImpact: number;
}

/**
 * Pure formatter: SimulationResult (+ the human-readable description of the simulated change) →
 * the compact briefing actually sent to the model. Looks up each gained/lost scheme's post-change
 * estimated amount from `sim.after` so the briefing shows what the household would actually move
 * to, not just whether they gained or lost.
 */
export function buildSimulationBriefing(sim: SimulationResult, changeDescription: string): SimulationBriefing {
  const amountFor = (schemeId: string): SchemeImpactSummary => {
    const result = sim.after.find((r) => r.scheme.id === schemeId)!;
    return { name: result.scheme.name, estimatedAmount: result.estimatedBenefitAmount, frequency: result.scheme.benefit.frequency };
  };

  return {
    changeDescription,
    gainedSchemes: sim.gained.map((s) => amountFor(s.id)),
    lostSchemes: sim.lost.map((s) => amountFor(s.id)),
    schemesRequiringAssessment: sim.requiresAssessment.map((s) => s.name),
    netMonthlyDollarImpact: sim.netMonthlyDollarImpact,
  };
}

const ExplanationSchema = z.object({
  headline: z.string(),
  explanation: z.string(),
  suggestion: z.string(),
  caveat: z.string(),
});

export type ExplanationResult = z.infer<typeof ExplanationSchema>;

const SYSTEM_PROMPT = `You are a warm, plain-language benefits counselor helping a family caregiver in Singapore
understand how a change affects their government support.

Rules:
- Speak directly to the reader as "you". Acknowledge that caregiving decisions are stressful —
  don't sound clinical, bureaucratic, or like a form letter.
- Avoid jargon ("means-tested", "per capita income", "discretionary assessment") — explain the
  idea in plain words instead, or don't mention it at all if it's not essential.
- Never present these numbers as official or final. This is a planning estimate, not a benefits
  determination. If any scheme in the briefing requires manual assessment, say so plainly rather
  than implying a guaranteed outcome.
- Always end with exactly one concrete, actionable suggestion — e.g. timing the change around a
  renewal date, applying for a specific scheme that could offset a loss, or getting the
  discretionary schemes assessed before making a final decision. Never a generic
  "consult a professional" non-answer with nothing else in it.
- Keep "explanation" to 2-4 sentences. Keep "headline" to one sentence a person could read at a
  glance. Keep "suggestion" to one or two sentences, one action.

Respond with JSON only, matching the given schema exactly.`;

export async function explainSimulationResult(briefing: SimulationBriefing): Promise<ExplanationResult> {
  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: EXPLANATION_MODEL,
    contents: JSON.stringify(briefing, null, 2),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiResponseSchema(ExplanationSchema),
    },
  });

  let parsed: ExplanationResult;
  try {
    parsed = ExplanationSchema.parse(JSON.parse(response.text ?? ""));
  } catch (err) {
    throw new Error(`Gemini did not return a parseable explanation: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parsed;
}
