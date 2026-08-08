import assert from "node:assert/strict";
import test from "node:test";
import { EMAIL_PATTERN, normalizeEmail } from "../src/lib/email.ts";

test("normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail("  Margaret@Example.COM "), "margaret@example.com");
  assert.equal(normalizeEmail("a@b.co"), "a@b.co");
});

test("normalizeEmail rejects anything not shaped like an address", () => {
  assert.equal(normalizeEmail("margaret"), null);
  assert.equal(normalizeEmail("margaret@example"), null, "needs a dot in the domain");
  assert.equal(normalizeEmail("margaret example@test.com"), null, "no whitespace");
  assert.equal(normalizeEmail("a@@b.com"), null);
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(undefined), null);
});

test("normalizeEmail rejects addresses longer than the column", () => {
  const long = `${"a".repeat(311)}@b.com`; // 311 + 6 = 317
  assert.equal(normalizeEmail(long), long);
  assert.equal(normalizeEmail(`${"a".repeat(315)}@b.com`), null);
});

/**
 * LIKE wildcards are legal in an email's local part. These have to survive
 * normalisation as literal characters, because friend search matches them with
 * `eq` — if a lookup ever moved back to `ilike`, `j%@gmail.com` would match
 * every j-address on the domain, and against admin_emails that would hand out
 * an admin role. See src/lib/email.ts and src/app/signup/actions.ts.
 */
test("normalizeEmail keeps LIKE wildcards as literal characters", () => {
  assert.equal(normalizeEmail("j%@gmail.com"), "j%@gmail.com");
  assert.equal(normalizeEmail("j_@gmail.com"), "j_@gmail.com");
  assert.equal(normalizeEmail("%@%.%"), "%@%.%");
  assert.ok(EMAIL_PATTERN.test("%@%.%"), "the pattern alone does not stop them");
});
