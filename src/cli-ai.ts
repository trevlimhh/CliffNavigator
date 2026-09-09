// Manual end-to-end demo: free text -> Gemini extraction -> rules engine -> Gemini explanation.
// Needs a real GEMINI_API_KEY (copy .env.example to .env first). Run with: npm run ai-demo
//
// This is a demo wiring script, not a real UI: it papers over any fields the extraction couldn't
// find with clearly-labeled demo defaults rather than actually asking the user follow-up
// questions (that's the job of a future form built on data/intake-schema.ts).

import "dotenv/config";
import { schemes } from "../data/schemes";
import { simulateChange } from "./engine";
import { extractProfileFromText } from "./services/intakeExtraction";
import { buildSimulationBriefing, explainSimulationResult } from "./services/explanation";
import type { HouseholdMember, HouseholdProfile } from "./types";

const sampleText =
  process.argv.slice(2).join(" ") ||
  "I care for my mum, household income is $2,400, I'm on ComCare, thinking of cutting to part-time work";

async function main() {
  console.log(`Input: "${sampleText}"\n`);

  const extraction = await extractProfileFromText(sampleText);
  console.log("=== Extracted fields ===");
  console.log(JSON.stringify(extraction.extracted, null, 2));
  console.log("Enrolled schemes:", extraction.enrolledSchemes);
  console.log("Detected change:", extraction.detectedChange);
  console.log("Assumptions:", extraction.assumptions);
  console.log("Still missing (would ask via data/intake-schema.ts in a real form):", extraction.missingRequiredFields);

  // Demo-only: fill any gaps with clearly-labeled defaults so the pipeline can run end-to-end.
  // A real app would stop here and ask the user the missingRequiredFields questions instead.
  const members: HouseholdMember[] = extraction.extracted.members.map((m) => ({
    age: m.age ?? 50,
    citizenship: m.citizenship ?? "citizen",
    employmentType: m.employmentType ?? "employee",
    hasDisability: m.hasDisability ?? false,
    cpfContributionsByAge55: 0,
  }));

  const profile: HouseholdProfile = {
    householdId: "cli-ai-demo",
    members: members.length > 0 ? members : [{ age: 50, citizenship: "citizen", employmentType: "employee", hasDisability: false, cpfContributionsByAge55: 0 }],
    grossHouseholdMonthlyIncome: extraction.extracted.grossHouseholdMonthlyIncome ?? 2400,
    housingType: extraction.extracted.housingType ?? "hdb_4_room",
    annualValueOfHome: extraction.extracted.annualValueOfHome ?? 10000,
    propertyCount: extraction.extracted.propertyCount ?? 1,
    hasCertifiedCareNeed: extraction.extracted.hasCertifiedCareNeed ?? true,
    enrolledSchemes: extraction.enrolledSchemes.map((e) => ({ schemeId: e.schemeId, enrollmentDate: e.enrollmentDate ?? "2025-01-01" })),
  };

  // detectedChange rarely carries an exact number (by design — the model won't fabricate one).
  // Demo-only illustrative stand-in for "cutting to part-time": a 40% income drop.
  const newIncome = Math.round(profile.grossHouseholdMonthlyIncome * 0.6);
  const changeDescription = extraction.detectedChange.changeDescription ?? `income dropping to $${newIncome}/month`;

  console.log(`\n=== Simulating: ${changeDescription} (illustrative -40% income, demo-only) ===`);
  const sim = simulateChange(profile, { type: "income_change", newGrossHouseholdMonthlyIncome: newIncome }, schemes);
  console.log(`Gained: ${sim.gained.map((s) => s.name).join(", ") || "(none)"}`);
  console.log(`Lost: ${sim.lost.map((s) => s.name).join(", ") || "(none)"}`);
  console.log(`Net monthly impact: $${sim.netMonthlyDollarImpact.toFixed(2)}`);

  const briefing = buildSimulationBriefing(sim, changeDescription);
  const explanation = await explainSimulationResult(briefing);

  console.log("\n=== Explanation ===");
  console.log(`Headline: ${explanation.headline}`);
  console.log(`Explanation: ${explanation.explanation}`);
  console.log(`Suggestion: ${explanation.suggestion}`);
  console.log(`Caveat: ${explanation.caveat}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
