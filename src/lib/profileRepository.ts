// Maps between Supabase rows and the engine's own HouseholdProfile shape (src/types.ts). This is
// the only place that knows about the DB schema — evaluateEligibility(), simulateChange(), etc.
// remain completely unaware that persistence exists at all.

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { EnrolledScheme, HouseholdMember, HouseholdProfile, RejectedScheme } from "@/types";

// Supabase/Postgrest errors are plain objects ({ code, details, hint, message }), not Error
// instances — thrown as-is, Next.js's error overlay just dumps that object with no indication of
// what failed. A real bug this caused: adding the rejected_schemes table without also running its
// migration surfaced as an unreadable "{code: ..., details: Null, ...}" on login instead of a
// message saying the table doesn't exist. Wrapping in a real Error with context fixes that for any
// future schema drift, not just this one instance.
function wrapDbError(error: PostgrestError, context: string): Error {
  return new Error(`${context}: ${error.message}${error.hint ? ` (hint: ${error.hint})` : ""}`);
}

export async function loadProfile(supabase: SupabaseClient, userId: string): Promise<HouseholdProfile | null> {
  const { data: profileRow, error: profileError } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (profileError) throw wrapDbError(profileError, "Loading profile");
  if (!profileRow) return null;

  const [
    { data: memberRows, error: membersError },
    { data: enrolledRows, error: enrolledError },
    { data: rejectedRows, error: rejectedError },
  ] = await Promise.all([
    supabase.from("household_members").select("*").eq("profile_id", userId).order("order_index", { ascending: true }),
    supabase.from("enrolled_schemes").select("*").eq("profile_id", userId),
    supabase.from("rejected_schemes").select("*").eq("profile_id", userId),
  ]);
  if (membersError) throw wrapDbError(membersError, "Loading household members");
  if (enrolledError) throw wrapDbError(enrolledError, "Loading enrolled schemes");
  if (rejectedError) throw wrapDbError(rejectedError, "Loading rejected schemes");

  const members: HouseholdMember[] = (memberRows ?? [])
    .sort((a, b) => (b.is_applicant ? 1 : 0) - (a.is_applicant ? 1 : 0)) // applicant first, matching the members[0] convention
    .map((row) => ({
      age: row.age,
      citizenship: row.citizenship,
      employmentType: row.employment_type,
      hasDisability: row.has_disability,
      cpfContributionsByAge55: row.cpf_contributions_by_age_55,
      relationship: row.relationship ?? undefined,
    }));

  const enrolledSchemes: EnrolledScheme[] = (enrolledRows ?? []).map((row) => ({
    schemeId: row.scheme_id,
    enrollmentDate: row.enrollment_date,
    actualAmount: row.actual_amount ?? undefined,
  }));

  const rejectedSchemes: RejectedScheme[] = (rejectedRows ?? []).map((row) => ({
    schemeId: row.scheme_id,
    rejectedDate: row.rejected_date,
    note: row.note ?? undefined,
  }));

  return {
    householdId: userId,
    members,
    grossHouseholdMonthlyIncome: profileRow.gross_household_monthly_income,
    housingType: profileRow.housing_type,
    annualValueOfHome: profileRow.annual_value_of_home,
    propertyCount: profileRow.property_count,
    hasCertifiedCareNeed: profileRow.has_certified_care_need,
    enrolledSchemes,
    rejectedSchemes,
  };
}

export async function hasCompletedOnboarding(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("onboarding_completed_at").eq("id", userId).maybeSingle();
  if (error) throw wrapDbError(error, "Checking onboarding status");
  return !!data?.onboarding_completed_at;
}

export interface SaveProfileOptions {
  emailNotificationsEnabled: boolean;
  notificationEmail: string | null;
  markOnboardingComplete?: boolean;
}

export async function saveProfile(supabase: SupabaseClient, userId: string, profile: HouseholdProfile, options: SaveProfileOptions): Promise<void> {
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    gross_household_monthly_income: profile.grossHouseholdMonthlyIncome,
    housing_type: profile.housingType,
    annual_value_of_home: profile.annualValueOfHome,
    property_count: profile.propertyCount,
    has_certified_care_need: profile.hasCertifiedCareNeed,
    email_notifications_enabled: options.emailNotificationsEnabled,
    notification_email: options.notificationEmail,
    ...(options.markOnboardingComplete ? { onboarding_completed_at: new Date().toISOString() } : {}),
  });
  if (profileError) throw wrapDbError(profileError, "Saving profile");

  // Full-replace strategy: members/enrolled schemes have no stable external id from the client,
  // so the simplest correct approach is delete-then-insert rather than trying to diff/upsert.
  const { error: deleteMembersError } = await supabase.from("household_members").delete().eq("profile_id", userId);
  if (deleteMembersError) throw wrapDbError(deleteMembersError, "Saving profile (clearing old household members)");

  if (profile.members.length > 0) {
    const { error: insertMembersError } = await supabase.from("household_members").insert(
      profile.members.map((m, index) => ({
        profile_id: userId,
        is_applicant: index === 0,
        order_index: index,
        age: m.age,
        citizenship: m.citizenship,
        employment_type: m.employmentType,
        has_disability: m.hasDisability,
        cpf_contributions_by_age_55: m.cpfContributionsByAge55,
        relationship: index === 0 ? "self" : (m.relationship ?? "unspecified"),
      })),
    );
    if (insertMembersError) throw wrapDbError(insertMembersError, "Saving profile (household members)");
  }

  const { error: deleteEnrolledError } = await supabase.from("enrolled_schemes").delete().eq("profile_id", userId);
  if (deleteEnrolledError) throw wrapDbError(deleteEnrolledError, "Saving profile (clearing old enrolled schemes)");

  if (profile.enrolledSchemes.length > 0) {
    const { error: insertEnrolledError } = await supabase.from("enrolled_schemes").insert(
      profile.enrolledSchemes.map((e) => ({
        profile_id: userId,
        scheme_id: e.schemeId,
        enrollment_date: e.enrollmentDate,
        actual_amount: e.actualAmount ?? null,
      })),
    );
    if (insertEnrolledError) throw wrapDbError(insertEnrolledError, "Saving profile (enrolled schemes)");
  }

  const { error: deleteRejectedError } = await supabase.from("rejected_schemes").delete().eq("profile_id", userId);
  if (deleteRejectedError) throw wrapDbError(deleteRejectedError, "Saving profile (clearing old rejected schemes)");

  const rejectedSchemes = profile.rejectedSchemes ?? [];
  if (rejectedSchemes.length > 0) {
    const { error: insertRejectedError } = await supabase.from("rejected_schemes").insert(
      rejectedSchemes.map((r) => ({
        profile_id: userId,
        scheme_id: r.schemeId,
        rejected_date: r.rejectedDate,
        note: r.note ?? null,
      })),
    );
    if (insertRejectedError) throw wrapDbError(insertRejectedError, "Saving profile (rejected schemes)");
  }
}

export interface NotificationSettings {
  emailNotificationsEnabled: boolean;
  notificationEmail: string | null;
  pushNotificationsEnabled: boolean;
}

export async function loadNotificationSettings(supabase: SupabaseClient, userId: string): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from("profiles")
    .select("email_notifications_enabled, notification_email, push_notifications_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw wrapDbError(error, "Loading notification settings");
  return {
    emailNotificationsEnabled: data?.email_notifications_enabled ?? false,
    notificationEmail: data?.notification_email ?? null,
    pushNotificationsEnabled: data?.push_notifications_enabled ?? false,
  };
}

/** Updates only notification preferences — independent of saveProfile() so the Settings page never has to resubmit the whole household profile just to flip a toggle. */
export async function updateNotificationSettings(supabase: SupabaseClient, userId: string, settings: NotificationSettings): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({
      email_notifications_enabled: settings.emailNotificationsEnabled,
      notification_email: settings.notificationEmail,
      push_notifications_enabled: settings.pushNotificationsEnabled,
    })
    .eq("id", userId);
  if (error) throw wrapDbError(error, "Updating notification settings");
}
