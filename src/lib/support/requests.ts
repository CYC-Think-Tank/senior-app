import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { supportProviders, supportRequests } from "@/lib/db/schema";
import {
  rankProviders,
  type ProviderMatch,
  type ProviderType,
  type ServiceMode,
  type SupportAssessment,
  type SupportPreference,
  type SupportProvider,
} from "@/lib/support/matching";

/**
 * Turning an assessed request into a saved, routed one.
 *
 * The web action and the iOS route both do this, and it is the one place in
 * the app where getting it wrong puts a stranger in front of a senior — so it
 * lives here once rather than twice.
 */

export const providerTypes: ProviderType[] = ["high_school", "college", "staff"];
export const serviceModes: ServiceMode[] = ["virtual", "nearby", "either"];
export const supportPreferences: SupportPreference[] = [
  ...providerTypes,
  "no_preference",
];

/**
 * The people who may currently be matched with a senior.
 *
 * Unverified and inactive rows are excluded here, not in the ranking: someone
 * imported from the CYC registration form arrives inactive on purpose and
 * stays out of every match until staff have vetted them.
 */
export async function matchableProviders(): Promise<SupportProvider[]> {
  let rows;
  try {
    rows = await db
      .select()
      .from(supportProviders)
      .where(
        and(eq(supportProviders.active, true), eq(supportProviders.verified, true)),
      );
  } catch (error) {
    console.error("Could not load support providers:", error);
    return [];
  }

  return rows.flatMap((row) => {
    if (!providerTypes.includes(row.providerType as ProviderType)) return [];
    return [
      {
        id: row.id,
        displayName: row.displayName,
        providerType: row.providerType as ProviderType,
        languages: row.languages,
        skills: row.skills,
        interests: row.interests,
        serviceModes: row.serviceModes.filter((mode): mode is ServiceMode =>
          serviceModes.includes(mode as ServiceMode),
        ),
        locations: row.locations,
        availability: row.availability,
        successfulMatches: row.successfulMatches,
      },
    ];
  });
}

export type SavedSupportRequest = {
  id: string;
  createdAt: string;
  status: string;
  match: ProviderMatch | null;
};

/**
 * Saves a request against the best available helper, or escalates it.
 *
 * A request with no match is only left `open` when it was safe for a
 * volunteer in the first place; anything the assessment flagged as needing
 * staff — or as an emergency — is escalated instead of waiting in the queue
 * for a volunteer who is never going to be the right answer.
 */
export async function saveSupportRequest({
  requesterId,
  requestText,
  assessment,
  preference,
  mode,
  location,
  availability,
}: {
  requesterId: string;
  requestText: string;
  assessment: SupportAssessment;
  preference: SupportPreference;
  mode: ServiceMode;
  location: string;
  availability: string;
}): Promise<SavedSupportRequest | null> {
  const providers = await matchableProviders();
  const match =
    rankProviders({ assessment, providers, preference, mode, location })[0] ??
    null;
  const status = match
    ? "matched"
    : assessment.safetyLevel === "staff_required" ||
        assessment.safetyLevel === "emergency"
      ? "escalated"
      : "open";

  let saved;
  try {
    [saved] = await db
      .insert(supportRequests)
      .values({
        requesterId,
        requestText,
        assistanceType: assessment.assistanceType,
        urgency: assessment.urgency,
        preferredLanguage: assessment.preferredLanguage,
        location,
        serviceMode: mode,
        availability,
        requiredSkills: assessment.requiredSkills,
        providerPreference: preference,
        safetyLevel: assessment.safetyLevel,
        recommendedTier: assessment.recommendedTier,
        assessmentSummary: assessment.summary,
        safetyReason: assessment.safetyReason,
        shareSummary: assessment.shareSummary,
        matchScore: match?.score ?? null,
        matchedProviderId: match?.provider.id ?? null,
        status,
      })
      .returning({
        id: supportRequests.id,
        createdAt: supportRequests.createdAt,
      });
  } catch (error) {
    console.error("Could not save support request:", error);
    return null;
  }
  if (!saved) return null;

  return { id: saved.id, createdAt: saved.createdAt, status, match };
}
