import assert from "node:assert/strict";
import test from "node:test";

// The pool is built lazily and never connects until a query actually runs, so
// a syntactically valid URL is enough to compile SQL. Set before the import so
// the module sees it.
process.env.DATABASE_URL ??=
  "postgresql://authz-test:authz-test@127.0.0.1:5432/authz-test";

const { db } = await import("../src/lib/db/index.ts");
const { sessions, friendships, profiles, circleShares } = await import(
  "../src/lib/db/schema.ts"
);
const {
  circleSharesFilter,
  friendshipsFilter,
  ownSessionsFilter,
  ownsGuestOf,
  profilesFilter,
} = await import("../src/lib/authz.ts");

/**
 * Row-level security used to make these filters unnecessary: a missing one was
 * invisible, because Postgres applied the policy anyway. Now a missing filter
 * is a data leak, and the only thing standing in its place is that each of
 * these predicates genuinely narrows the query.
 *
 * So these tests compile each predicate to SQL and check it constrains what it
 * claims to. They need no database — a filter that quietly became "true" would
 * pass every integration test written against a single user's own data, and
 * fail here.
 */

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

const compile = (table, predicate) =>
  db.select().from(table).where(predicate).toSQL();

test("own-sessions filter constrains on both ownership and state", () => {
  const { sql, params } = compile(sessions, ownSessionsFilter(ALICE));

  // The ownership half: a subquery tying the session's guest to this account.
  assert.match(sql, /exists/i, "ownership is expressed as an EXISTS subquery");
  assert.match(sql, /"guests"/, "the subquery reaches the guests table");
  assert.match(sql, /"user_id"/, "and compares the guest's owning account");
  assert.ok(
    params.includes(ALICE),
    "the caller's own id is bound as a parameter, not dropped"
  );

  // The state half: finished, or abandoned mid-recording long enough ago.
  assert.ok(
    params.includes("ready") && params.includes("recording"),
    "both reachable states are named"
  );
  assert.match(
    sql,
    /"last_checkpoint_at"/,
    "the abandonment window is what keeps a live conversation out"
  );
});

test("own-sessions filter cannot be satisfied by another account's id", () => {
  const forAlice = compile(sessions, ownSessionsFilter(ALICE));
  const forBob = compile(sessions, ownSessionsFilter(BOB));

  assert.equal(
    forAlice.sql,
    forBob.sql,
    "the same shape is used for everyone — only the bound id differs"
  );
  assert.ok(forAlice.params.includes(ALICE));
  assert.ok(!forAlice.params.includes(BOB), "Bob's id is nowhere in Alice's query");
});

test("ownsGuestOf checks ownership without pinning the conversation's state", () => {
  const { sql, params } = compile(sessions, ownsGuestOf(ALICE));

  assert.match(sql, /exists/i);
  assert.match(sql, /"user_id"/);
  assert.ok(params.includes(ALICE));
  // Renaming applies its own status filter; this predicate must not smuggle
  // one in, or an unfinished conversation would silently become unnameable.
  assert.ok(
    !params.includes("ready") && !params.includes("recording"),
    "no state constraint is baked in"
  );
});

test("friendships filter covers both sides of the ordered pair", () => {
  const { sql, params } = compile(friendships, friendshipsFilter(ALICE));

  assert.match(sql, /"user_low"/, "matches the low side");
  assert.match(sql, /"user_high"/, "and the high side");
  assert.match(sql, / or /i, "as an either-or, not an and");
  assert.equal(
    params.filter((value) => value === ALICE).length,
    2,
    "the caller's id is compared against both columns"
  );
});

test("profiles filter admits your own row and connected accounts, nothing else", () => {
  const { sql, params } = compile(profiles, profilesFilter(ALICE));

  assert.match(sql, /"profiles"\."id" = /, "your own row is reachable");
  assert.match(sql, /exists/i, "and so is anyone you have a friendship row with");
  assert.match(sql, /"friendships"/, "connection is decided by the friendship table");
  assert.ok(params.includes(ALICE));
  assert.ok(
    !/ilike|like/i.test(sql),
    "no pattern match: friend search is deliberately a separate, unfiltered path"
  );
});

test("circle-shares filter is limited to the caller and their friends", () => {
  const stranger = "33333333-3333-4333-8333-333333333333";
  const { sql, params } = compile(circleShares, circleSharesFilter(ALICE, [BOB]));

  assert.match(sql, /"owner_id" in /i, "an explicit owner allowlist");
  assert.ok(params.includes(ALICE), "the caller sees their own switches");
  assert.ok(params.includes(BOB), "and their friend's");
  assert.ok(
    !params.includes(stranger),
    "someone they are not friends with is not in the list"
  );
});

test("an empty friend list still scopes to the caller alone", () => {
  const { params } = compile(circleShares, circleSharesFilter(ALICE, []));

  assert.deepEqual(
    params,
    [ALICE],
    "with no friends the filter narrows to your own shares, never to everyone's"
  );
});
