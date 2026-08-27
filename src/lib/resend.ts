import "server-only";

import { Resend } from "resend";
import { APP_NAME } from "@/lib/constants";

type AuthEmailKind = "password-reset";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * The password-reset email. Better Auth calls this from `sendResetPassword`
 * with a one-time link; the address and the link are the whole payload.
 */
export async function sendPasswordResetEmail({
  to,
  actionLink,
}: {
  to: string;
  actionLink: string;
}) {
  const kind: AuthEmailKind = "password-reset";
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  if (!from) throw new Error("RESEND_FROM_EMAIL is not configured.");

  const subject = `Reset your ${APP_NAME} password`;
  const heading = "Choose a new password";
  const introduction =
    `Use this secure link to set a new password for your ${APP_NAME} account. ` +
    `It expires in an hour.`;
  const buttonLabel = "Set a new password";
  const safeActionLink = escapeHtml(actionLink);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f6efeb;color:#34242a;font-family:Arial,sans-serif;padding:32px 16px">
    <div style="max-width:560px;margin:0 auto;background:#fffaf5;border:1px solid #e2d4d7;border-radius:16px;padding:32px">
      <p style="margin:0 0 20px;color:#a64f6d;font-size:18px;font-weight:700">${APP_NAME}</p>
      <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:28px;line-height:1.2">${heading}</h1>
      <p style="margin:0 0 24px;color:#745f66;font-size:16px;line-height:1.6">${introduction}</p>
      <a href="${safeActionLink}" style="display:inline-block;border-radius:10px;background:#a64f6d;color:#ffffff;padding:13px 20px;text-decoration:none;font-weight:700">${buttonLabel}</a>
      <p style="margin:24px 0 0;color:#a38e95;font-size:13px;line-height:1.5">If you didn’t ask to reset your password, you can safely ignore this email.</p>
    </div>
  </body>
</html>`,
    text: `${introduction}\n\n${buttonLabel}: ${actionLink}\n\nIf you didn’t ask to reset your password, you can safely ignore this email.`,
    tags: [{ name: "category", value: kind }],
  });

  if (error) throw new Error(error.message);
}
