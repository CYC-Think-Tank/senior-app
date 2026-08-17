import { NextResponse, type NextRequest } from "next/server";
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
  const { supabase, admin, user } = auth;

  // "people read their own support requests" scopes this to the caller.
  const { data } = await supabase
    .from("support_requests")
    .select(
      "id, request_text, assistance_type, urgency, status, assessment_summary, matched_provider_id, created_at"
    )
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  // Provider rosters are staff-only (migration 020), so the matched provider's
  // name is looked up with the service role and only their name is returned.
  const providerIds = [
    ...new Set(rows.map((row) => row.matched_provider_id).filter(Boolean)),
  ] as string[];

  const providerNames = new Map<string, string>();
  if (providerIds.length > 0) {
    const { data: providers } = await admin
      .from("support_providers")
      .select("id, display_name")
      .in("id", providerIds);
    for (const provider of providers ?? []) {
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
  const { admin, user } = auth;

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

  const { data: providerRows, error: providerError } = await admin
    .from("support_providers")
    .select(
      "id, display_name, provider_type, languages, skills, interests, service_modes, locations, availability, successful_matches"
    )
    .eq("active", true)
    .eq("verified", true);
  if (providerError) {
    console.error("Could not load support providers:", providerError);
  }

  const providers = (providerRows ?? [])
    .map((row) => providerFromRow(row as Record<string, unknown>))
    .filter((provider): provider is SupportProvider => Boolean(provider));
  const match =
    rankProviders({ assessment, providers, preference, mode, location })[0] ?? null;
  const status = match
    ? "matched"
    : assessment.safetyLevel === "staff_required" ||
        assessment.safetyLevel === "emergency"
      ? "escalated"
      : "open";

  const { data, error } = await admin
    .from("support_requests")
    .insert({
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
    .select("id, created_at")
    .single();

  if (error || !data) {
    console.error("Could not save support request:", error);
    return serverError("We could not save your request. Please try again.");
  }

  return NextResponse.json({
    id: data.id,
    requestText,
    assistanceType: assessment.assistanceType,
    urgency: assessment.urgency,
    status,
    assessmentSummary: assessment.summary,
    // Only the matched person's name — never the roster row behind it.
    matchedProviderName: match?.provider.displayName ?? null,
    createdAt: data.created_at,
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
