// The one module allowed to touch the Gemini SDK directly / read GEMINI_API_KEY.
// src/engine.ts and data/*.ts never import from src/services/ — that keeps the rules engine
// testable and runnable with zero network access or API key.

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

// Free-tier Gemini models: a smaller/cheaper one for the narrow extraction task, a fuller one for
// the more nuanced explanation-writing task — mirrors the original Haiku/Sonnet two-tier split
// from when this used the Anthropic API, and has the side benefit that the two calls draw from
// separate per-model free-tier quotas rather than sharing one.
// gemini-2.5-flash-lite was rejected live by the API ("no longer available to new users") —
// updated per the API's own error message pointing at its replacement, not guessed.
export const EXTRACTION_MODEL = "gemini-3.5-flash-lite";
export const EXPLANATION_MODEL = "gemini-3.5-flash";

let client: GoogleGenAI | null = null;

/**
 * Lazily constructs the client on first use (not at import time) so importing this module never
 * fails just because GEMINI_API_KEY isn't set yet — same reasoning as the previous Anthropic
 * client wrapper. Tests mock getGeminiClient() directly, so they never need a real key either.
 */
export function getGeminiClient(): GoogleGenAI {
  if (client) return client;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Copy .env.example to .env and add your key (free at aistudio.google.com/apikey).");
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}

/**
 * Converts a Zod schema into the JSON Schema shape Gemini's `responseJsonSchema` accepts.
 *
 * Two Gemini-specific quirks this works around:
 * - Zod's `.nullable()` on a primitive (`z.number().nullable()`) serializes as
 *   `{ type: ["number", "null"] }` — a 2020-12-style array type. Gemini's documented supported
 *   subset lists `anyOf` but not an array-valued `type`, so this rewrites every array `type` into
 *   `anyOf: [{type: t}, ...]`, which Gemini does support. (Zod already emits `anyOf` on its own
 *   for `.enum().nullable()` — only bare primitive nullables need this fix.)
 * - Gemini's schema doesn't recognize the `$schema` meta field Zod adds at the root; stripped.
 */
export function toGeminiResponseSchema(schema: z.ZodType): unknown {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
  return stripAndFixForGemini(jsonSchema);
}

function stripAndFixForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripAndFixForGemini);
  if (node && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$schema") continue;
      result[key] = stripAndFixForGemini(value);
    }
    if (Array.isArray(result.type)) {
      const types = result.type as string[];
      delete result.type;
      result.anyOf = types.map((t) => ({ type: t }));
    }
    return result;
  }
  return node;
}
