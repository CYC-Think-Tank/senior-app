import "server-only";

type AuthEmailType = "invite" | "magiclink";

export function createAuthCallbackUrl(
  tokenHash: string,
  type: AuthEmailType
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const callbackUrl = new URL("/auth/callback", siteUrl);
  callbackUrl.searchParams.set("token_hash", tokenHash);
  callbackUrl.searchParams.set("type", type);
  return callbackUrl.toString();
}
