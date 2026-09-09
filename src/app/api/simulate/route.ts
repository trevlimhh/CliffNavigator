import { NextResponse } from "next/server";
import { schemes } from "@data/schemes";
import { simulateChange } from "@/engine";
import { buildSimulationBriefing, explainSimulationResult } from "@/services/explanation";
import { mockExplainSimulationResult } from "@/lib/mockAiResponses";
import { isMissingApiKeyError } from "@/lib/aiAvailability";
import type { HouseholdProfile, ProfileChange } from "@/types";

interface SimulateRequestBody {
  profile?: HouseholdProfile;
  change?: ProfileChange;
  changeDescription?: string;
}

export async function POST(request: Request) {
  let body: SimulateRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { profile, change, changeDescription } = body;
  if (!profile || !change || !changeDescription) {
    return NextResponse.json({ error: "profile, change, and changeDescription are all required." }, { status: 400 });
  }

  const simulation = simulateChange(profile, change, schemes);
  const briefing = buildSimulationBriefing(simulation, changeDescription);

  try {
    const explanation = await explainSimulationResult(briefing);
    return NextResponse.json({ source: "live", simulation, explanation });
  } catch (err) {
    if (isMissingApiKeyError(err)) {
      return NextResponse.json({ source: "mock", simulation, explanation: mockExplainSimulationResult(briefing) });
    }
    console.error("explanation failed", err);
    return NextResponse.json({ error: "Failed to generate an explanation. Please try again.", simulation }, { status: 502 });
  }
}
