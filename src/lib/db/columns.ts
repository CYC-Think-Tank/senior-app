import { customType } from "drizzle-orm/pg-core";

/**
 * `timestamptz` that reads and writes ISO-8601 strings, keeping the full
 * precision Postgres stored.
 *
 * Two things had to hold at once here.
 *
 * The app is built on timestamps being strings: `src/lib/types.ts` types
 * `created_at` as `string`, pages do `new Date(session.created_at)`, and
 * writes send `new Date().toISOString()`. Supabase's REST layer handed them
 * over as JSON strings, so mapping back to a string keeps every read site
 * working untouched.
 *
 * But `updated_at` is also an optimistic-lock token: `src/lib/memory/summary.ts`
 * and `src/lib/memoir/workflow.ts` claim a row by matching the value they last
 * read. Postgres writes those with `now()`, which has **microsecond**
 * precision, while a JavaScript `Date` only has milliseconds — so round-
 * tripping through `Date` would truncate the value and the compare-and-swap
 * would never match anything. That failure is quiet: the update simply affects
 * no rows, and the caller concludes it lost a race it was never in.
 *
 * So the driver is told to hand `timestamptz` back unparsed (see the `types`
 * option in `src/lib/db/index.ts`) and the only work done here is reshaping
 * Postgres's output into valid ISO-8601, digit for digit.
 */

/**
 * `2026-08-27 11:40:00.123456+00` → `2026-08-27T11:40:00.123456+00:00`.
 *
 * Nothing is re-computed — the offset is left as Postgres reported it and only
 * padded to the `±HH:MM` form ISO-8601 wants, so no precision can be lost on
 * the way through.
 */
function toIsoString(raw: string): string {
  const isoish = raw.replace(" ", "T");
  const offset = isoish.match(/([+-]\d{2})(:?\d{2})?$/);

  // No offset at all means the session was already in UTC.
  if (!offset) return `${isoish}Z`;
  // Already `±HH:MM`.
  if (offset[2]) return isoish;
  return `${isoish}:00`;
}

export const timestamptz = customType<{
  data: string;
  driverData: string | Date;
}>({
  dataType() {
    return "timestamptz";
  },
  fromDriver(value) {
    // The `Date` branch is a guard, not a path taken in this app: it only
    // happens if something builds a pool without the type parser below.
    return value instanceof Date ? value.toISOString() : toIsoString(value);
  },
  toDriver(value) {
    return value;
  },
});
