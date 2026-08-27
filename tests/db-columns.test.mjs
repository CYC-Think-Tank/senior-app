import assert from "node:assert/strict";
import test from "node:test";

const { timestamptz } = await import("../src/lib/db/columns.ts");

// `customType` returns a column *builder*; the mapping functions live on the
// built column.
const column = timestamptz("updated_at").build({});

/**
 * `updated_at` is an optimistic-lock token: `src/lib/memory/summary.ts` and
 * `src/lib/memoir/workflow.ts` claim a row by matching the value they last
 * read. Postgres writes it with `now()`, at microsecond precision.
 *
 * Round-tripping that through a JavaScript `Date` truncates it to
 * milliseconds, and the compare-and-swap then matches nothing — quietly, since
 * an update that affects no rows looks exactly like losing a race. These tests
 * are here because that failure has no other symptom.
 */

test("microseconds survive the trip out of Postgres", () => {
  const read = column.mapFromDriverValue("2026-08-27 11:40:00.123456+00");

  assert.ok(
    read.includes("123456"),
    `all six digits are kept, got ${read}`
  );
  assert.equal(read, "2026-08-27T11:40:00.123456+00:00");
});

test("what comes out goes back in unchanged", () => {
  const stored = "2026-08-27 11:40:00.123456+00";
  const read = column.mapFromDriverValue(stored);

  assert.equal(
    column.mapToDriverValue(read),
    read,
    "the value is handed back to Postgres verbatim, not re-derived"
  );
});

test("the result is a timestamp JavaScript can still read", () => {
  const read = column.mapFromDriverValue("2026-08-27 11:40:00.123456+00");
  const asDate = new Date(read);

  assert.ok(!Number.isNaN(asDate.getTime()), "pages do new Date(created_at)");
  assert.equal(asDate.toISOString(), "2026-08-27T11:40:00.123Z");
});

test("offsets are padded, never recomputed", () => {
  assert.equal(
    column.mapFromDriverValue("2026-08-27 06:40:00.5-05"),
    "2026-08-27T06:40:00.5-05:00",
    "a bare ±HH offset becomes ±HH:MM"
  );
  assert.equal(
    column.mapFromDriverValue("2026-08-27 11:40:00+05:30"),
    "2026-08-27T11:40:00+05:30",
    "an offset that is already ±HH:MM is left alone"
  );
  assert.equal(
    column.mapFromDriverValue("2026-08-27 11:40:00"),
    "2026-08-27T11:40:00Z",
    "no offset means the session was in UTC"
  );
});

test("a Date is still handled, for a pool built without the type parser", () => {
  const read = column.mapFromDriverValue(
    new Date("2026-08-27T11:40:00.123Z")
  );
  assert.equal(read, "2026-08-27T11:40:00.123Z");
});
