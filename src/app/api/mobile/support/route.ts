import { NextResponse, type NextRequest } from "next/server";
import {
  badRequest,
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { supportProviders, supportRequests } from "@/lib/db/schema";
import { assessSupportRequest } from "@/lib/support/ai";
import {
  saveSupportRequest,
  serviceModes as modes,
  supportPreferences,
} from "@/lib/support/requests";
import type { ServiceMode, SupportPreference } from "@/lib/support/matching";

export const dynamic = "force-dynamic";

/** The caller's own requests, newest first. */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  // Filtered to the caller's own requests, which is the whole of the
  // "people read their own support requests" policy.
  const rows = await db
    .select({
      id: supportRequests.id,
      requestText: supportRequests.requestText,
      assistanceType: supportRequests.assistanceType,
      urgency: supportRequests.urgency,
      status: supportRequests.status,
      assessmentSummary: supportRequests.assessmentSummary,
      matchedProviderId: supportRequests.matchedProviderId,
      createdAt: supportRequests.createdAt,
    })
    .from(supportRequests)
    .where(eq(supportRequests.requesterId, user.id))
    .orderBy(desc(supportRequests.createdAt));

  // Provider rosters are staff-only (migration 020), so only the matched
  // person's name is looked up, and only their name is returned.
  const providerIds = [
    ...new Set(rows.map((row) => row.matchedProviderId).filter((id): id is string => Boolean(id))),
  ];

  const providerNames = new Map<string, string>();
  if (providerIds.length > 0) {
    const providers = await db
      .select({
        id: supportProviders.id,
        displayName: supportProviders.displayName,
      })
      .from(supportProviders)
      .where(inArray(supportProviders.id, providerIds));
    for (const provider of providers) {
      providerNames.set(provider.id, provider.displayName);
    }
  }

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      requestText: row.requestText,
      assistanceType: row.assistanceType,
      urgency: row.urgency,
      status: row.status,
      assessmentSummary: row.assessmentSummary,
      matchedProviderName: row.matchedProviderId
        ? providerNames.get(row.matchedProviderId) ?? null
        : null,
      createdAt: row.createdAt,
    }))
  );
}

/**
 * Submits a request for human help. Port of `createSupportRequest()`.
 *
 * The assessment and the safety screen run here, server-side, for the same
 * reason they do on the web: what tier of helper a request is safe for is not
 * something the person asking — or their phone — gets to decide.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const body = await readJson(request);
  const requestText = readString(body, "requestText", 2000);
  const language = readString(body, "preferredLanguage", 80) || "English";
  const location = readString(body, "location", 160);
  const availability = readString(body, "availability", 240);
  const rawMode = readString(body, "serviceMode", 20) as ServiceMode;
  const mode = modes.includes(rawMode) ? rawMode : "either";
  const rawPreference = readString(body, "providerPreference", 40) as SupportPreference;
  const preference = supportPreferences.includes(rawPreference)
    ? rawPreference
    : "no_preference";

  if (requestText.length < 3) {
    return badRequest("Please say what you need help with.");
  }

  const assessment = await assessSupportRequest({
    request: requestText,
    language,
    preference,
    location,
    availability,
  });

  const saved = await saveSupportRequest({
    requesterId: user.id,
    requestText,
    assessment,
    preference,
    mode,
    location,
    availability,
  });

  if (!saved) {
    return serverError("We could not save your request. Please try again.");
  }

  return NextResponse.json({
    id: saved.id,
    requestText,
    assistanceType: assessment.assistanceType,
    urgency: assessment.urgency,
    status: saved.status,
    assessmentSummary: assessment.summary,
    // Only the matched person's name — never the roster row behind it.
    matchedProviderName: saved.match?.provider.displayName ?? null,
    createdAt: saved.createdAt,
  });
}
