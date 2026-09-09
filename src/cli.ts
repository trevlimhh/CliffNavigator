// Manual exploration entry point: `npm run cli`
// Prints eligibility, upcoming renewals, and income-cliff distances for a sample household,
// then simulates an income drop and a scheme expiry.

import { schemes } from "../data/schemes";
import {
  evaluateAllSchemes,
  estimateCurrentBenefitAmount,
  getIncomeCliffs,
  getRenewalStatuses,
  simulateChange,
} from "./engine";
import type { EligibilityResult, HouseholdProfile, IncomeCliffInfo, RenewalStatus, SimulationResult } from "./types";

const sampleProfile: HouseholdProfile = {
  householdId: "demo-household-1",
  members: [
    // applicant / primary caregiver
    { age: 58, employmentType: "employee", citizenship: "citizen", hasDisability: false, cpfContributionsByAge55: 0 },
    // elderly care recipient
    { age: 85, employmentType: "not_employed", citizenship: "citizen", hasDisability: true, cpfContributionsByAge55: 90000 },
  ],
  grossHouseholdMonthlyIncome: 2600,
  housingType: "hdb_4_room",
  annualValueOfHome: 10000,
  propertyCount: 1,
  hasCertifiedCareNeed: true,
  enrolledSchemes: [
    { schemeId: "home_caregiving_grant", enrollmentDate: "2024-03-01" },
    { schemeId: "caregivers_training_grant", enrollmentDate: "2026-05-01" },
  ],
};

function printEligibility(label: string, results: EligibilityResult[]): void {
  console.log(`\n=== ${label} ===`);
  for (const r of results) {
    const amountStr = r.estimatedBenefitAmount !== null ? `$${r.estimatedBenefitAmount}/${r.scheme.benefit.frequency}` : "-";
    console.log(`  [${r.status.padEnd(32)}] ${r.scheme.name} (${amountStr})`);
    for (const cr of r.criteriaResults) {
      if (!cr.passed) console.log(`      ✗ ${cr.reason}`);
    }
  }
}

function printRenewals(label: string, renewals: RenewalStatus[]): void {
  console.log(`\n=== ${label} ===`);
  if (renewals.length === 0) {
    console.log("  (not enrolled in any scheme)");
    return;
  }
  for (const r of renewals) {
    const scheme = schemes.find((s) => s.id === r.schemeId)!;
    const current = estimateCurrentBenefitAmount(scheme, sampleProfile, r.enrollmentDate);
    const dueStr =
      r.nextRenewalDate === null
        ? "no renewal cycle on file"
        : `next due ${r.nextRenewalDate} (${r.daysUntilRenewal! >= 0 ? `in ${r.daysUntilRenewal} days` : `${-r.daysUntilRenewal!} days OVERDUE`})`;
    console.log(`  ${scheme.name}: enrolled since ${r.enrollmentDate}, currently ~$${current}/${scheme.benefit.frequency}, ${dueStr}`);
  }
}

function printIncomeCliffs(label: string, cliffs: IncomeCliffInfo[]): void {
  console.log(`\n=== ${label} ===`);
  for (const c of cliffs) {
    const scheme = schemes.find((s) => s.id === c.schemeId)!;
    if (c.incomeBasis === null) {
      console.log(`  ${scheme.name}: no income ceiling in this model (status: ${c.status})`);
      continue;
    }
    const buffer = c.bufferToIneligibility !== null ? `$${c.bufferToIneligibility.toFixed(0)}` : "-";
    console.log(
      `  ${scheme.name}: ${c.incomeBasis} income $${c.currentIncomeValue?.toFixed(0)} vs ceiling $${c.ineligibilityThreshold} ` +
        `(buffer: ${buffer}/mo before losing eligibility)${
          c.nextTierDropThreshold !== null ? `; next tier drop at $${c.nextTierDropThreshold} (buffer $${c.bufferToNextTierDrop?.toFixed(0)})` : ""
        }`,
    );
  }
}

function printSimulation(label: string, sim: SimulationResult): void {
  console.log(`\n--- Simulation: ${label} ---`);
  console.log(`  Gained:              ${sim.gained.map((s) => s.name).join(", ") || "(none)"}`);
  console.log(`  Lost:                ${sim.lost.map((s) => s.name).join(", ") || "(none)"}`);
  console.log(`  Requires assessment: ${sim.requiresAssessment.map((s) => s.name).join(", ") || "(none)"}`);
  console.log(`  Net monthly impact:  ${sim.netMonthlyDollarImpact >= 0 ? "+" : ""}$${sim.netMonthlyDollarImpact.toFixed(2)}/month`);
}

const baseline = evaluateAllSchemes(sampleProfile, schemes);
printEligibility("Baseline eligibility", baseline);

printRenewals("Upcoming renewals for enrolled schemes", getRenewalStatuses(sampleProfile, schemes));

printIncomeCliffs("Income-cliff distance for every scheme", getIncomeCliffs(sampleProfile, schemes));

const incomeDropSim = simulateChange(sampleProfile, { type: "income_change", newGrossHouseholdMonthlyIncome: 1200 }, schemes);
printSimulation("Household income drops to $1,200/month", incomeDropSim);

const schemeExpirySim = simulateChange(sampleProfile, { type: "scheme_expiry", schemeId: "home_caregiving_grant" }, schemes);
printSimulation("Home Caregiving Grant expires / is disenrolled", schemeExpirySim);

console.log(
  "\nReminder: some figures in data/schemes.ts are still unverified placeholders (see each scheme's simplificationNote) — check before demoing.\n",
);
