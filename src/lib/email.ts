// Thin wrapper around Resend for notification emails. Mirrors the GEMINI_API_KEY pattern:
// if RESEND_API_KEY isn't set, sendNotificationEmail() no-ops (logs and returns) rather than
// throwing, since email is a nice-to-have on top of the in-app notification that always exists.

import { Resend } from "resend";

const FROM_ADDRESS = "Benefit Cliff Navigator <onboarding@resend.dev>";

export async function sendNotificationEmail(to: string, headline: string, message: string): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email skipped — no RESEND_API_KEY] Would have sent to ${to}: "${headline}"`);
    return { sent: false };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: headline,
    text: `${message}\n\n— Benefit Cliff Navigator (this is a planning estimate, not an official notice — verify with the relevant agency).`,
  });

  if (error) {
    console.error("Failed to send notification email:", error);
    return { sent: false };
  }
  return { sent: true };
}
