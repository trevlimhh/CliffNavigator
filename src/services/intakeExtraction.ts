// Gemini 2.5 Flash-Lite: turns a caregiver's free-text description into structured HouseholdProfile
// fields. Kept narrow on purpose — the model extracts facts and flags its own uncertainty;
// figuring out which *required* fields are still missing is deterministic code (computeMissingRequiredFields),
// checked against the same data/intake-schema.ts a real form would use, so the two can't silently drift apart.

import { z } from "zod";
import { getGeminiClient, EXTRACTION_MODEL, toGeminiResponseSchema } from "./geminiClient";
import { schemes } from "../../data/schemes";
import { householdIntakeFields, memberIntakeFields, enrolledSchemeIntakeFields } from "../../data/intake-schema";
import type { Citizenship, EmploymentType, HousingType, Scheme } from "../types";

const HOUSING_TYPES = ["hdb_1_2_room", "hdb_3_room", "hdb_4_room", "hdb_5_room_or_exec", "private_property"] as const satisfies readonly HousingType[];
const CITIZENSHIPS = ["citizen", "pr", "other"] as const satisfies readonly Citizenship[];
const EMPLOYMENT_TYPES = ["employee", "self_employed", "platform_worker", "not_employed"] as const satisfies readonly EmploymentType[];
const RELATIONSHIPS = ["self", "parent", "spouse", "child", "other_relative", "unspecified"] as const;

const ExtractedMemberSchema = z.object({
  relationshipToApplicant: z.enum(RELATIONSHIPS),
  age: z.number().nullable(),
  citizenship: z.enum(CITIZENSHIPS).nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
  hasDisability: z.boolean().nullable(),
});

const ExtractedProfileFieldsSchema = z.object({
  grossHouseholdMonthlyIncome: z.number().nullable(),
  housingType: z.enum(HOUSING_TYPES).nullable(),
  annualValueOfHome: z.number().nullable(),
  propertyCount: z.number().nullable(),
  hasCertifiedCareNeed: z.boolean().nullable(),
  members: z.array(ExtractedMemberSchema),
});

const DetectedChangeSchema = z.object({
  mentionsHypotheticalChange: z.boolean(),
  /** Free-text summary only, e.g. "cutting to part-time work" — the model must not fabricate a specific new dollar figure. */
  changeDescription: z.string().nullable(),
});

export type ExtractedMember = z.infer<typeof ExtractedMemberSchema>;
export type ExtractedProfileFields = z.infer<typeof ExtractedProfileFieldsSchema>;
export type DetectedChangeSignal = z.infer<typeof DetectedChangeSchema>;

export interface ExtractedEnrolledScheme {
  schemeId: string;
  enrollmentDate: string | null;
}

export interface IntakeExtractionResult {
  extracted: ExtractedProfileFields;
  enrolledSchemes: ExtractedEnrolledScheme[];
  detectedChange: DetectedChangeSignal;
  /** Free-text notes on inferred/ambiguous values, e.g. "assumed 'my mum' is 60+ since age wasn't stated". */
  assumptions: string[];
  /** Computed against data/intake-schema.ts's required fields — not asked of the model. */
  missingRequiredFields: string[];
}

function buildSchemeCatalogSummary(catalog: Scheme[]): string {
  return catalog.map((s) => `- ${s.id}: ${s.name} — ${s.description}`).join("\n");
}

function buildSystemPrompt(catalog: Scheme[]): string {
  return `You are an intake assistant for a Singapore family-caregiver support navigator.

Extract ONLY what is explicitly stated or very confidently implied by the text. Never invent a
number, age, date, or fact that isn't there — if something isn't mentioned, return null for it.
Record any inference you did make (e.g. "assumed 'my mum' implies female and elderly, but her
exact age wasn't given") as a short note in "assumptions".

The person writing the description is always household member 0, the applicant, with
relationshipToApplicant "self" — include them as a member even if they don't describe themselves
directly (e.g. "I care for my mum" implies two members: the writer as "self", and "mum" as "parent").

grossHouseholdMonthlyIncome is a MONTHLY figure in Singapore dollars, before deductions, combining
every working household member's income — not an annual figure.

When the text mentions being on a government support scheme, match it to exactly one of these
scheme IDs (or omit it if you can't confidently match one):
${buildSchemeCatalogSummary(catalog)}
If a scheme is mentioned generically (e.g. "ComCare" or "on assistance from MSF") without
specifying which sub-program, default to comcare_smta — that's what people usually mean.
Only ever use scheme IDs from this exact list.

If the text describes a hypothetical FUTURE change (a possible income change, quitting, cutting
hours, going part-time, a scheme ending or not being renewed), set detectedChange accordingly —
but do NOT fabricate a specific new income figure for a vague description like "cutting to
part-time"; just summarize it in changeDescription and leave the precise number to a follow-up
question.

Respond with JSON only, matching the given schema exactly.`;
}

/**
 * Diffs the model's extraction against data/intake-schema.ts's required fields. Pure and
 * deterministic — no API call, no mocking needed to test it. Returns intake-field-shaped ids
 * (e.g. "grossHouseholdMonthlyIncome", "members[1].age", "enrolledSchemes[0].enrollmentDate") so
 * a caller can map them straight back to the questions in data/intake-schema.ts.
 */
export function computeMissingRequiredFields(extracted: ExtractedProfileFields, enrolledSchemes: ExtractedEnrolledScheme[]): string[] {
  const missing: string[] = [];

  for (const field of householdIntakeFields) {
    if (!field.required) continue;
    const value = extracted[field.id as keyof ExtractedProfileFields];
    if (value === null || value === undefined) missing.push(field.id);
  }

  if (extracted.members.length === 0) {
    missing.push("members");
  } else {
    extracted.members.forEach((member, index) => {
      const isApplicant = member.relationshipToApplicant === "self";
      for (const field of memberIntakeFields) {
        if (!field.required) continue;
        if (field.askWhen === "isApplicant" && !isApplicant) continue;
        if (field.askWhen === "age >= 55" && !(member.age !== null && member.age >= 55)) continue;
        const value = member[field.id as keyof ExtractedMember];
        if (value === null || value === undefined) missing.push(`members[${index}].${field.id}`);
      }
    });
  }

  enrolledSchemes.forEach((enrolled, index) => {
    for (const field of enrolledSchemeIntakeFields) {
      if (!field.required) continue;
      const value = enrolled[field.id as keyof ExtractedEnrolledScheme];
      if (value === null || value === undefined) missing.push(`enrolledSchemes[${index}].${field.id}`);
    }
  });

  return missing;
}

export async function extractProfileFromText(freeText: string, catalog: Scheme[] = schemes): Promise<IntakeExtractionResult> {
  const schemeIds = catalog.map((s) => s.id);
  if (schemeIds.length === 0) throw new Error("catalog must contain at least one scheme");

  const responseSchema = z.object({
    extracted: ExtractedProfileFieldsSchema,
    enrolledSchemes: z.array(
      z.object({
        schemeId: z.enum(schemeIds as [string, ...string[]]),
        enrollmentDate: z.string().nullable(),
      }),
    ),
    detectedChange: DetectedChangeSchema,
    assumptions: z.array(z.string()),
  });

  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: freeText,
    config: {
      systemInstruction: buildSystemPrompt(catalog),
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiResponseSchema(responseSchema),
    },
  });

  let parsed: z.infer<typeof responseSchema>;
  try {
    parsed = responseSchema.parse(JSON.parse(response.text ?? ""));
  } catch (err) {
    throw new Error(`Gemini did not return a parseable intake extraction: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    extracted: parsed.extracted,
    enrolledSchemes: parsed.enrolledSchemes,
    detectedChange: parsed.detectedChange,
    assumptions: parsed.assumptions,
    missingRequiredFields: computeMissingRequiredFields(parsed.extracted, parsed.enrolledSchemes),
  };
}
