import type { SupabaseClient } from "@supabase/supabase-js";
import { queryAllWixCmsItems } from "@/lib/wix-cms";
import {
  providerFromRegistration,
  registrationsCollectionId,
  seniorCareFilter,
  type CycProviderRow,
} from "@/lib/support/cyc-registrations";

// One sync handles this many registrations; the rest wait for the next run.
const MAX_REGISTRATIONS = 1000;

export type CycRegistrationSyncResult = {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
};

const sameArray = (a: string[], b: unknown) =>
  Array.isArray(b) && a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * Pulls every Senior Care registration from the thecyc.org Wix CMS into
 * `support_providers`.
 *
 * New people arrive unverified and inactive: matching in
 * `createSupportRequest` only considers verified, active providers, so nobody
 * is put in front of a senior until staff have vetted them. Re-runs refresh
 * only the fields the registration form owns — staff edits to languages,
 * skills, availability, and verification survive.
 */
export async function syncCycSeniorCareRegistrations(
  admin: SupabaseClient,
): Promise<CycRegistrationSyncResult> {
  const items = await queryAllWixCmsItems({
    collectionId: registrationsCollectionId(),
    filter: seniorCareFilter(),
    maxItems: MAX_REGISTRATIONS,
  });

  const candidates = new Map<string, CycProviderRow>();
  for (const item of items) {
    const row = providerFromRegistration(item);
    if (row) candidates.set(row.external_id, row);
  }

  const result: CycRegistrationSyncResult = {
    fetched: items.length,
    created: 0,
    updated: 0,
    skipped: items.length - candidates.size,
  };
  if (!candidates.size) return result;

  const { data: existingRows, error: existingError } = await admin
    .from("support_providers")
    .select("id, external_id, display_name, provider_type, email, phone, school, grade, locations")
    .in("external_id", [...candidates.keys()]);
  if (existingError) throw new Error(existingError.message);

  const existing = new Map(
    (existingRows ?? []).map((row) => [row.external_id as string, row]),
  );
  const syncedAt = new Date().toISOString();

  const inserts = [...candidates.values()]
    .filter((row) => !existing.has(row.external_id))
    .map((row) => ({ ...row, verified: false, active: false, synced_at: syncedAt }));

  if (inserts.length) {
    const { error } = await admin.from("support_providers").insert(inserts);
    if (error) throw new Error(error.message);
    result.created = inserts.length;
  }

  for (const [externalId, row] of candidates) {
    const current = existing.get(externalId);
    if (!current) continue;

    const unchanged =
      current.display_name === row.display_name
      && current.provider_type === row.provider_type
      && current.email === row.email
      && current.phone === row.phone
      && current.school === row.school
      && current.grade === row.grade
      && sameArray(row.locations, current.locations);
    if (unchanged) continue;

    const { error } = await admin
      .from("support_providers")
      .update({
        display_name: row.display_name,
        provider_type: row.provider_type,
        email: row.email,
        phone: row.phone,
        school: row.school,
        grade: row.grade,
        locations: row.locations,
        synced_at: syncedAt,
      })
      .eq("id", current.id);
    if (error) throw new Error(error.message);
    result.updated += 1;
  }

  return result;
}
