"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assessSupportRequest } from "@/lib/support/ai";
import {
  rankProviders,
  type ProviderMatch,
  type ProviderType,
  type ServiceMode,
  type SupportAssessment,
  type SupportPreference,
  type SupportProvider,
} from "@/lib/support/matching";

export type SupportRequestState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      requestId: string;
      assessment: SupportAssessment;
      match: ProviderMatch | null;
    };

const providerTypes: ProviderType[] = ["high_school", "college", "staff"];
const preferences: SupportPreference[] = [...providerTypes, "no_preference"];
const modes: ServiceMode[] = ["virtual", "nearby", "either"];

const clean = (value: FormDataEntryValue | null, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function providerFromRow(row: Record<string, unknown>): SupportProvider | null {
  if (
    typeof row.id !== "string"
    || typeof row.display_name !== "string"
    || !providerTypes.includes(row.provider_type as ProviderType)
  ) return null;

  const strings = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: row.id,
    displayName: row.display_name,
    providerType: row.provider_type as ProviderType,
    languages: strings(row.languages),
    skills: strings(row.skills),
    interests: strings(row.interests),
    serviceModes: strings(row.service_modes).filter((mode): mode is ServiceMode => modes.includes(mode as ServiceMode)),
    locations: strings(row.locations),
    availability: typeof row.availability === "string" ? row.availability : "",
    successfulMatches: typeof row.successful_matches === "number" ? row.successful_matches : 0,
  };
}

export async function createSupportRequest(
  _previous: SupportRequestState,
  formData: FormData,
): Promise<SupportRequestState> {
  const { user } = await requireUser();
  const request = clean(formData.get("request"), 2000);
  const language = clean(formData.get("language"), 80) || "English";
  const location = clean(formData.get("location"), 160);
  const availability = clean(formData.get("availability"), 240);
  const rawPreference = clean(formData.get("preference"), 40) as SupportPreference;
  const rawMode = clean(formData.get("mode"), 20) as ServiceMode;
  const preference = preferences.includes(rawPreference) ? rawPreference : "no_preference";
  const mode = modes.includes(rawMode) ? rawMode : "either";

  if (request.length < 3) {
    return { status: "error", message: "Please tell WiseShare what you need help with." };
  }
  if (!availability) {
    return { status: "error", message: "Please share a day or time that works for you." };
  }

  const assessment = await assessSupportRequest({
    request,
    language,
    preference,
    location,
    availability,
  });
  const admin = createSupabaseAdminClient();
  const { data: providerRows, error: providerError } = await admin
    .from("support_providers")
    .select("id, display_name, provider_type, languages, skills, interests, service_modes, locations, availability, successful_matches")
    .eq("active", true)
    .eq("verified", true);

  if (providerError) {
    console.error("Could not load support providers:", providerError);
  }
  const providers = (providerRows ?? [])
    .map((row) => providerFromRow(row as Record<string, unknown>))
    .filter((provider): provider is SupportProvider => Boolean(provider));
  const match = rankProviders({ assessment, providers, preference, mode, location })[0] ?? null;
  const status = match
    ? "matched"
    : assessment.safetyLevel === "staff_required" || assessment.safetyLevel === "emergency"
      ? "escalated"
      : "open";

  const { data, error } = await admin
    .from("support_requests")
    .insert({
      requester_id: user.id,
      request_text: request,
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
    .select("id")
    .single();

  if (error || !data) {
    console.error("Could not save support request:", error);
    return { status: "error", message: "We could not save your request. Please try again." };
  }

  revalidatePath("/dashboard/support");
  revalidatePath("/admin/support");
  return { status: "success", requestId: data.id, assessment, match };
}

export async function submitSupportFollowUp(requestId: string, resolved: boolean) {
  const { user } = await requireUser();
  if (!requestId) return;
  const admin = createSupabaseAdminClient();

  // Server Actions are public POST endpoints. Pin the update to the signed-in
  // requester's id so one senior can never answer another person's follow-up.
  const { data: request } = await admin
    .from("support_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("requester_id", user.id)
    .maybeSingle();
  if (!request) return;

  const { error } = await admin
    .from("support_requests")
    .update({
      status: resolved ? "resolved" : "escalated",
      feedback: resolved ? "resolved_by_senior" : "senior_still_needs_help",
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .eq("requester_id", user.id);
  if (error) console.error("Could not save support follow-up:", error);
  revalidatePath("/dashboard/support");
  revalidatePath("/admin/support");
}
