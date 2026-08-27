import type { WixDataItem } from "@/lib/wix-cms";
import type { ProviderType } from "@/lib/support/matching";

/** The project option students pick on thecyc.org to work with seniors. */
const SENIOR_CARE_OPTION = "Senior Care";
const DEFAULT_COLLECTION_ID = "Registrations";
const HIGH_SCHOOL_GRADES = new Set(["9", "10", "11", "12"]);

export type CycProviderRow = {
  external_id: string;
  source: "cyc_registration";
  display_name: string;
  provider_type: ProviderType;
  email: string;
  phone: string;
  school: string;
  grade: string;
  locations: string[];
  languages: string[];
  service_modes: string[];
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The collection thecyc.org writes its registration form into. */
export function registrationsCollectionId() {
  return (
    process.env.WIX_REGISTRATIONS_COLLECTION_ID?.trim() || DEFAULT_COLLECTION_ID
  );
}

/** Wix-side filter selecting only the people who signed up for Senior Care. */
export function seniorCareFilter() {
  return { projectOption: SENIOR_CARE_OPTION };
}

/**
 * Grade 9–12 registrants are the high-school tier; anyone else who signed up
 * for Senior Care (returning students, older volunteers) is treated as the
 * college tier. Staff providers are only ever added by hand.
 */
function providerTypeFor(grade: string): ProviderType {
  return HIGH_SCHOOL_GRADES.has(grade) ? "high_school" : "college";
}

/** Canadian postal codes match on their forward sortation area (first three). */
function locationsFor(postalCode: string): string[] {
  const normalised = postalCode.toUpperCase().replace(/\s+/gu, "");
  if (!normalised) return [];
  const fsa = normalised.slice(0, 3);
  return fsa === normalised ? [fsa] : [fsa, normalised];
}

/** Maps one Wix registration row onto a WiseShare support-provider record. */
export function providerFromRegistration(
  item: WixDataItem,
): CycProviderRow | null {
  const data = (item.data ?? item) as Record<string, unknown>;
  const externalId = text(item.id) || text(data._id);
  const email = text(data.email);
  const displayName =
    [text(data.firstName), text(data.lastName)].filter(Boolean).join(" ") ||
    email;

  // Without an id there is nothing to sync against, and without a name or an
  // email staff would have no one to contact.
  if (!externalId || !displayName) return null;

  const grade = text(data.grade);
  return {
    external_id: externalId,
    source: "cyc_registration",
    display_name: displayName,
    provider_type: providerTypeFor(grade),
    email,
    phone: text(data.phone),
    school: text(data.school),
    grade,
    locations: locationsFor(text(data.postalCode)),
    languages: ["English"],
    service_modes: ["either"],
  };
}
