import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { supportProviders } from "@/lib/db/schema";
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
export async function syncCycSeniorCareRegistrations(): Promise<CycRegistrationSyncResult> {
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

  const existingRows = await db
    .select({
      id: supportProviders.id,
      externalId: supportProviders.externalId,
      displayName: supportProviders.displayName,
      providerType: supportProviders.providerType,
      email: supportProviders.email,
      phone: supportProviders.phone,
      school: supportProviders.school,
      grade: supportProviders.grade,
      locations: supportProviders.locations,
    })
    .from(supportProviders)
    .where(inArray(supportProviders.externalId, [...candidates.keys()]));

  const existing = new Map(
    existingRows.flatMap((row) => (row.externalId ? [[row.externalId, row] as const] : [])),
  );
  const syncedAt = new Date().toISOString();

  const inserts = [...candidates.values()]
    .filter((row) => !existing.has(row.external_id))
    .map((row) => ({
      externalId: row.external_id,
      source: row.source,
      displayName: row.display_name,
      providerType: row.provider_type,
      email: row.email,
      phone: row.phone,
      school: row.school,
      grade: row.grade,
      locations: row.locations,
      languages: row.languages,
      serviceModes: row.service_modes,
      // Columns the registration form has nothing to say about. They are NOT
      // NULL with no default here, unlike the old table, so they are spelled
      // out rather than left to the database.
      skills: [],
      interests: [],
      // New people arrive unverified and inactive on purpose; see above.
      verified: false,
      active: false,
      syncedAt,
    }));

  if (inserts.length) {
    await db.insert(supportProviders).values(inserts);
    result.created = inserts.length;
  }

  for (const [externalId, row] of candidates) {
    const current = existing.get(externalId);
    if (!current) continue;

    const unchanged =
      current.displayName === row.display_name
      && current.providerType === row.provider_type
      && current.email === row.email
      && current.phone === row.phone
      && current.school === row.school
      && current.grade === row.grade
      && sameArray(row.locations, current.locations);
    if (unchanged) continue;

    await db
      .update(supportProviders)
      .set({
        displayName: row.display_name,
        providerType: row.provider_type,
        email: row.email,
        phone: row.phone,
        school: row.school,
        grade: row.grade,
        locations: row.locations,
        syncedAt,
      })
      .where(eq(supportProviders.id, current.id));
    result.updated += 1;
  }

  return result;
}
