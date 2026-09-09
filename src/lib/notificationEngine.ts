// Pure decision logic for "what notifications should exist right now" — deliberately separated
// from anything that reads/writes the database, so the actual rules (when is a renewal "due
// soon", what counts as an eligibility change) are unit-testable without Supabase. The caller
// (src/app/api/notifications/check/route.ts) is responsible for persistence and de-duplication.

import { getRenewalStatuses } from "../engine";
import type { EligibilityResult, EligibilityStatus, HouseholdProfile, Scheme } from "../types";

export type NotificationType = "renewal_due" | "renewal_overdue" | "eligibility_gained" | "eligibility_lost";

export interface NotificationDraft {
  type: NotificationType;
  schemeId: string;
  headline: string;
  message: string;
}

const RENEWAL_WARNING_DAYS = 30;

/** A renewal that's overdue OR due within RENEWAL_WARNING_DAYS gets a notification. */
export function detectRenewalNotifications(profile: HouseholdProfile, catalog: Scheme[], asOf: Date = new Date()): NotificationDraft[] {
  const renewals = getRenewalStatuses(profile, catalog, asOf);
  const drafts: NotificationDraft[] = [];

  for (const r of renewals) {
    if (r.daysUntilRenewal === null) continue;
    const scheme = catalog.find((s) => s.id === r.schemeId);
    if (!scheme) continue;

    if (r.daysUntilRenewal < 0) {
      drafts.push({
        type: "renewal_overdue",
        schemeId: scheme.id,
        headline: `${scheme.name} may need renewing`,
        message: `${scheme.name} was due for reassessment on ${r.nextRenewalDate}. Next step: contact the agency to confirm whether it's still active, or reapply if it has lapsed.`,
      });
    } else if (r.daysUntilRenewal <= RENEWAL_WARNING_DAYS) {
      drafts.push({
        type: "renewal_due",
        schemeId: scheme.id,
        headline: `${scheme.name} is due for renewal soon`,
        message: `${scheme.name} is due for reassessment on ${r.nextRenewalDate} (in ${r.daysUntilRenewal} day${r.daysUntilRenewal === 1 ? "" : "s"}). Next step: check with the agency whether any action is needed on your end before then.`,
      });
    }
  }

  return drafts;
}

export interface PreviousEligibility {
  schemeId: string;
  status: EligibilityStatus;
}

/**
 * Compares the current eligibility computation against the last stored snapshot. Returns nothing
 * if there's no prior snapshot to compare against (first-ever check for this household).
 */
export function detectEligibilityChangeNotifications(previous: PreviousEligibility[], current: EligibilityResult[]): NotificationDraft[] {
  if (previous.length === 0) return [];

  const drafts: NotificationDraft[] = [];
  for (const result of current) {
    const priorEntry = previous.find((p) => p.schemeId === result.scheme.id);
    if (!priorEntry) continue; // scheme wasn't in the catalog at the last snapshot (e.g. newly added)

    const wasReceiving = priorEntry.status !== "ineligible";
    const nowReceiving = result.status !== "ineligible";

    if (!wasReceiving && nowReceiving) {
      drafts.push({
        type: "eligibility_gained",
        schemeId: result.scheme.id,
        headline: `You may now be eligible for ${result.scheme.name}`,
        message: `Based on your latest profile, you may now qualify for ${result.scheme.name}. Next step: review the details on your dashboard and consider applying.`,
      });
    } else if (wasReceiving && !nowReceiving) {
      drafts.push({
        type: "eligibility_lost",
        schemeId: result.scheme.id,
        headline: `You may no longer be eligible for ${result.scheme.name}`,
        message: `Based on your latest profile, you may no longer qualify for ${result.scheme.name}. Next step: if this is unexpected, check with the agency before this affects your payments.`,
      });
    }
  }
  return drafts;
}
