import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { supportProviders, supportRequests } from "@/lib/db/schema";
import {
  badRequest,
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { assessSupportRequest } from "@/lib/support/ai";
import {
  rankProviders,
  type ProviderType,
  type ServiceMode,
  type SupportPreference,
  type SupportProvider,
} from "@/lib/support/matching";

export const dynamic = "force-dynamic";

const providerTypes: ProviderType[] = ["high_school", "college", "staff"];
const modes: ServiceMode[] = ["virtual", "nearby", "either"];

/** The caller's own requests, newest first. */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  // "people read their own support requests", stated explicitly.
  const rows = await db
    .select({
      id: supportRequests.id,
      request_text: supportRequests.request_text,
      assistance_type: supportRequests.assistance_type,
      urgency: supportRequests.urgency,
      status: supportRequests.status,
      assessment_summary: supportRequests.assessment_summary,
      matched_provider_id: supportRequests.matched_provider_id,
      created_at: supportRequests.created_at,
    })
    .from(supportRequests)
    .where(eq(supportRequests.requester_id, user.id))
    .orderBy(desc(supportRequests.created_at));

  // Provider rosters stay staff-only (migration 020): the matched provider is
  // looked up here and only their name is ever returned.
  const providerIds = [
    ...new Set(rows.map((row) => row.matched_provider_id).filter(Boolean)),
  ] as string[];

  const providerNames = new Map<string, string>();
  if (providerIds.length > 0) {
    const providers = await db
      .select({
        id: supportProviders.id,
        display_name: supportProviders.display_name,
      })
      .from(supportProviders)
      .where(inArray(supportProviders.id, providerIds));
    for (const provider of providers) {
      providerNames.set(provider.id, provider.display_name);
    }
  }

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      requestText: row.request_text,
      assistanceType: row.assistance_type,
      urgency: row.urgency,
      status: row.status,
      assessmentSummary: row.assessment_summary,
      matchedProviderName: row.matched_provider_id
        ? providerNames.get(row.matched_provider_id) ?? null
        : null,
      createdAt: row.created_at,
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
  const preference = [...providerTypes, "no_preference"].includes(rawPreference)
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

  let providerRows: Record<string, unknown>[] = [];
  try {
    providerRows = await db
      .select({
        id: supportProviders.id,
        display_name: supportProviders.display_name,
        provider_type: supportProviders.provider_type,
        languages: supportProviders.languages,
        skills: supportProviders.skills,
        interests: supportProviders.interests,
        service_modes: supportProviders.service_modes,
        locations: supportProviders.locations,
        availability: supportProviders.availability,
        successful_matches: supportProviders.successful_matches,
      })
      .from(supportProviders)
      .where(
        and(eq(supportProviders.active, true), eq(supportProviders.verified, true))
      );
  } catch (providerError) {
    console.error("Could not load support providers:", providerError);
  }

  const providers = providerRows
    .map((row) => providerFromRow(row))
    .filter((provider): provider is SupportProvider => Boolean(provider));
  const match =
    rankProviders({ assessment, providers, preference, mode, location })[0] ?? null;
  const status = match
    ? "matched"
    : assessment.safetyLevel === "staff_required" ||
        assessment.safetyLevel === "emergency"
      ? "escalated"
      : "open";

  let created: { id: string; created_at: string } | undefined;
  try {
    [created] = await db.insert(supportRequests).values({
      requester_id: user.id,
      request_text: requestText,
      assistance_type: assessment.assistanceType,
      urgency: assessment.urgency,
      preferred_language: assessment.preferredLanguage,
      location,
      service_mode: mode,
      availability,
      required_skills: assessment.requiredSkills,
      provider_preference: preference,
      safety_level: assessment.safetyLevel,
      recommended_tier: assessment.recommendedTier,
      assessment_summary: assessment.summary,
      safety_reason: assessment.safetyReason,
      share_summary: assessment.shareSummary,
      match_score: match?.score ?? null,
      matched_provider_id: match?.provider.id ?? null,
      status,
    })
    .returning({ id: supportRequests.id, created_at: supportRequests.created_at });
  } catch (error) {
    console.error("Could not save support request:", error);
    return serverError("We could not save your request. Please try again.");
  }

  return NextResponse.json({
    id: created.id,
    requestText,
    assistanceType: assessment.assistanceType,
    urgency: assessment.urgency,
    status,
    assessmentSummary: assessment.summary,
    // Only the matched person's name — never the roster row behind it.
    matchedProviderName: match?.provider.displayName ?? null,
    createdAt: created.created_at,
  });
}

function providerFromRow(row: Record<string, unknown>): SupportProvider | null {
  if (
    typeof row.id !== "string" ||
    typeof row.display_name !== "string" ||
    !providerTypes.includes(row.provider_type as ProviderType)
  ) {
    return null;
  }

  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  return {
    id: row.id,
    displayName: row.display_name,
    providerType: row.provider_type as ProviderType,
    languages: strings(row.languages),
    skills: strings(row.skills),
    interests: strings(row.interests),
    serviceModes: strings(row.service_modes).filter((mode): mode is ServiceMode =>
      modes.includes(mode as ServiceMode)
    ),
    locations: strings(row.locations),
    availability: typeof row.availability === "string" ? row.availability : "",
    successfulMatches:
      typeof row.successful_matches === "number" ? row.successful_matches : 0,
  };
}
