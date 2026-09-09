import { NextResponse } from "next/server";
import { extractProfileFromText } from "@/services/intakeExtraction";
import { mockExtractProfileFromText } from "@/lib/mockAiResponses";
import { isMissingApiKeyError } from "@/lib/aiAvailability";

export async function POST(request: Request) {
  let body: { freeText?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { freeText } = body;
  if (typeof freeText !== "string" || freeText.trim().length === 0) {
    return NextResponse.json({ error: "freeText is required." }, { status: 400 });
  }

  try {
    const result = await extractProfileFromText(freeText);
    return NextResponse.json({ source: "live", result });
  } catch (err) {
    if (isMissingApiKeyError(err)) {
      return NextResponse.json({ source: "mock", result: mockExtractProfileFromText(freeText) });
    }
    console.error("intake extraction failed", err);
    return NextResponse.json({ error: "Failed to analyze your description. Please try again." }, { status: 502 });
  }
}
