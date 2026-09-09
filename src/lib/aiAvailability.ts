// Shared check the API routes use to detect "no API key configured" and fall back to demo/mock
// mode, instead of failing the whole request. See src/services/geminiClient.ts for the exact
// error message this matches.

export function isMissingApiKeyError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("GEMINI_API_KEY is not set");
}
