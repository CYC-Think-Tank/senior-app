import "server-only";

import { Resend } from "resend";
import { APP_NAME } from "@/lib/constants";

type AuthEmailKind = "magic-link" | "invitation";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function sendAuthEmail({
  to,
  actionLink,
  kind,
}: {
  to: string;
  actionLink: string;
  kind: AuthEmailKind;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  if (!from) throw new Error("RESEND_FROM_EMAIL is not configured.");

  const isInvitation = kind === "invitation";
  const subject = isInvitation
    ? `You’re invited to ${APP_NAME}`
    : `Sign in to ${APP_NAME}`;
  const heading = isInvitation
    ? "Your family stories are waiting"
    : `Sign in to ${APP_NAME}`;
  const introduction = isInvitation
    ? `You’ve been invited to listen to private family stories on ${APP_NAME}.`
    : `Use this secure link to sign in to ${APP_NAME}.`;
  const buttonLabel = isInvitation ? "Accept invitation" : "Sign in";
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
      <p style="margin:24px 0 0;color:#a38e95;font-size:13px;line-height:1.5">If you didn’t request this email, you can safely ignore it.</p>
    </div>
  </body>
</html>`,
    text: `${introduction}\n\n${buttonLabel}: ${actionLink}\n\nIf you didn’t request this email, you can safely ignore it.`,
    tags: [{ name: "category", value: kind }],
  });

  if (error) throw new Error(error.message);
}
