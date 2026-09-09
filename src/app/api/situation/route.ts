// "Tell us what's changed" — PREVIEW ONLY. Diffs the signed-in user's STORED profile against a
// freshly extracted/edited one and explains the difference, but does NOT persist anything — the
// user hasn't confirmed they actually want this change saved yet (see /api/situation/confirm,
// which the client calls separately only if the user says yes to "update my profile?").

import { NextResponse } from "next/server";
import { schemes } from "@data/schemes";
import { compareProfiles } from "@/engine";
import { buildSimulationBriefing, explainSimulationResult } from "@/services/explanation";
import { mockExplainSimulationResult } from "@/lib/mockAiResponses";
import { isMissingApiKeyError } from "@/lib/aiAvailability";
import { createClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/profileRepository";
import type { HouseholdProfile } from "@/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { newProfile?: HouseholdProfile; changeDescription?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { newProfile, changeDescription } = body;
  if (!newProfile || !changeDescription) {
    return NextResponse.json({ error: "newProfile and changeDescription are required." }, { status: 400 });
  }

  const oldProfile = await loadProfile(supabase, user.id);
  if (!oldProfile) return NextResponse.json({ error: "No existing profile — complete onboarding first." }, { status: 400 });

  const simulation = compareProfiles(oldProfile, newProfile, schemes);
  const briefing = buildSimulationBriefing(simulation, changeDescription);

  let explanation;
  let source: "live" | "mock" = "live";
  try {
    explanation = await explainSimulationResult(briefing);
  } catch (err) {
    if (!isMissingApiKeyError(err)) {
      console.error("explanation failed", err);
      return NextResponse.json({ error: "Failed to generate an explanation. Please try again." }, { status: 502 });
    }
    source = "mock";
    explanation = mockExplainSimulationResult(briefing);
  }

  return NextResponse.json({ source, simulation, explanation });
}
