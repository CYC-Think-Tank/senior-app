"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { supportProviders, supportRequests } from "@/lib/db/schema";
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
  const match = rankProviders({ assessment, providers, preference, mode, location })[0] ?? null;
  const status = match
    ? "matched"
    : assessment.safetyLevel === "staff_required" || assessment.safetyLevel === "emergency"
      ? "escalated"
      : "open";

  let created: { id: string } | undefined;
  try {
    [created] = await db.insert(supportRequests).values({
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
    .returning({ id: supportRequests.id });
  } catch (error) {
    console.error("Could not save support request:", error);
    return { status: "error", message: "We could not save your request. Please try again." };
  }

  if (!created) {
    return { status: "error", message: "We could not save your request. Please try again." };
  }

  revalidatePath("/dashboard/support");
  revalidatePath("/admin/support");
  return { status: "success", requestId: created.id, assessment, match };
}

export async function submitSupportFollowUp(requestId: string, resolved: boolean) {
  const { user } = await requireUser();
  if (!requestId) return;

  // Server Actions are public POST endpoints. Pinning the update to the
  // signed-in requester's id is what stops one senior answering another
  // person's follow-up — it is part of the write, not a check before it.
  try {
    await db
      .update(supportRequests)
      .set({
        status: resolved ? "resolved" : "escalated",
        feedback: resolved ? "resolved_by_senior" : "senior_still_needs_help",
        updated_at: new Date().toISOString(),
      })
      .where(
        and(
          eq(supportRequests.id, requestId),
          eq(supportRequests.requester_id, user.id)
        )
      );
  } catch (error) {
    console.error("Could not save support follow-up:", error);
  }
  revalidatePath("/dashboard/support");
  revalidatePath("/admin/support");
}
