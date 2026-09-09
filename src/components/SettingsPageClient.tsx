"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { getNotificationPermission, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import type { NotificationSettings } from "@/lib/profileRepository";

interface SettingsPageClientProps {
  email: string;
  initialSettings: NotificationSettings;
}

export function SettingsPageClient({ email, initialSettings }: SettingsPageClientProps) {
  const router = useRouter();

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Notifications
  const [emailEnabled, setEmailEnabled] = useState(initialSettings.emailNotificationsEnabled);
  const [notificationEmail, setNotificationEmail] = useState(initialSettings.notificationEmail ?? email);
  const [pushEnabled, setPushEnabled] = useState(initialSettings.pushNotificationsEnabled);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [notifSuccess, setNotifSuccess] = useState(false);

  // Delete account
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const supabase = createClient();
      // Re-verify the current password before allowing a change, rather than trusting the
      // existing session alone — protects against someone changing the password on a device
      // where the account is already signed in but the current password isn't known to them.
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (reauthError) throw new Error("Current password is incorrect.");

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleSaveNotifications() {
    setNotifSaving(true);
    setNotifError(null);
    setNotifSuccess(false);
    try {
      if (pushEnabled && !initialSettings.pushNotificationsEnabled) {
        const result = await subscribeToPush();
        if (!result.ok) throw new Error(result.error ?? "Failed to enable push notifications.");
      } else if (!pushEnabled && initialSettings.pushNotificationsEnabled) {
        await unsubscribeFromPush();
      }

      const res = await fetch("/api/account/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailNotificationsEnabled: emailEnabled,
          notificationEmail: emailEnabled ? notificationEmail || null : null,
          pushNotificationsEnabled: pushEnabled,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save notification settings.");

      setNotifSuccess(true);
    } catch (err) {
      setNotifError(getErrorMessage(err));
    } finally {
      setNotifSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    if (!window.confirm("This permanently deletes your account and all saved data. This cannot be undone. Continue?")) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete account.");
      router.push("/login");
    } catch (err) {
      setDeleteError(getErrorMessage(err));
      setDeleting(false);
    }
  }

  const pushSupported = isPushSupported();
  const pushPermission = getNotificationPermission();

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Account settings</h1>
          <a href="/dashboard" className="text-sm text-slate-500 underline hover:text-slate-700">
            ← Back to dashboard
          </a>
        </div>

        {/* Change password */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <label className="block text-sm">
              <span className="text-slate-700">Current password</span>
              <input
                type="password"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 p-2"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">New password</span>
              <input
                type="password"
                required
                minLength={6}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Confirm new password</span>
              <input
                type="password"
                required
                minLength={6}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={passwordSaving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:bg-slate-300"
            >
              {passwordSaving ? "Updating…" : "Update password"}
            </button>
            {passwordError && <p className="text-sm text-rose-600">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-emerald-600">Password updated.</p>}
          </form>
        </section>

        {/* Notification preferences */}
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-600">Choose how you'd like to hear about renewals due and eligibility changes.</p>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
            Email notifications
          </label>
          {emailEnabled && (
            <label className="block text-sm">
              <span className="text-slate-700">Notification email</span>
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
              />
            </label>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={pushEnabled}
              disabled={!pushSupported}
              onChange={(e) => setPushEnabled(e.target.checked)}
            />
            Push notifications (this browser)
          </label>
          {!pushSupported && <p className="text-xs text-slate-500">Push notifications aren't supported in this browser.</p>}
          {pushSupported && pushPermission === "denied" && (
            <p className="text-xs text-rose-600">Notifications are blocked for this site in your browser settings — enable them there first.</p>
          )}

          <button
            onClick={handleSaveNotifications}
            disabled={notifSaving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:bg-slate-300"
          >
            {notifSaving ? "Saving…" : "Save notification settings"}
          </button>
          {notifError && <p className="text-sm text-rose-600">{notifError}</p>}
          {notifSuccess && <p className="text-sm text-emerald-600">Saved.</p>}
        </section>

        {/* Delete account */}
        <section className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-lg font-semibold text-rose-900">Delete account</h2>
          <p className="text-sm text-rose-800">
            This permanently deletes your account, profile, household details, enrolled schemes, and notification history. This cannot be undone.
          </p>
          <label className="block text-sm">
            <span className="text-rose-900">
              Type <strong>DELETE</strong> to confirm
            </span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-rose-300 p-2"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
          </label>
          <button
            onClick={handleDeleteAccount}
            disabled={deleteConfirmText !== "DELETE" || deleting}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-200"
          >
            {deleting ? "Deleting…" : "Delete my account permanently"}
          </button>
          {deleteError && <p className="text-sm text-rose-700">{deleteError}</p>}
        </section>
      </div>
    </main>
  );
}
