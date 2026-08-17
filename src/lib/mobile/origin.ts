import type { NextRequest } from "next/server";

/**
 * The public origin of this deployment, for links the app hands to a person.
 *
 * Taken from the request rather than a build-time constant so a share link
 * copied on a phone points at whatever host that phone reached — a preview
 * deployment, a LAN address during development, or production — and matches
 * how the web dashboard builds the same URL from its request headers.
 */
export function siteOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host");

  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${host}`;
}
