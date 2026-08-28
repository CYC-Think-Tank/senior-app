import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { friendshipPair } from "../src/lib/friends.ts";

/**
 * Deny-case tests for the authorization module.
 *
 * Under Supabase, Row Level Security filtered every query before it returned,
 * so a route that forgot to scope a read still could not leak. `src/lib/db`
 * has no such net — every query it runs sees every row — and src/lib/authz.ts
 * is what replaced it. These are the tests for the class of bug that change
 * introduced: they assert that one account cannot reach another's data.
 *
 * The allow cases are here too, but only to prove a denial is a real check
 * rather than a function that says no to everything.
 *
 * Needs a live PostgreSQL database with the schema applied:
 *
 *   createdb senior_app_test
 *   psql "$TEST_DATABASE_URL" -f supabase/migrations/001_migrate_azure.sql
 *   psql "$TEST_DATABASE_URL" -f supabase/migrations/002_better_auth.sql
 *   TEST_DATABASE_URL=postgres://localhost:5432/senior_app_test npm test
 *
 * Without TEST_DATABASE_URL the file skips, so `npm test` stays runnable with
 * no database — but then it is not checking any of this.
 */

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? test : test.skip;

// Set before the module under test is loaded: src/lib/db reads it on import.
if (url) process.env.DATABASE_URL = url;

let db;
let schema;
let authz;
let pool;

// Alice tells the stories. Bob becomes her friend part-way through. Carol is
// an admin, and Dave is the stranger who never connects to anyone — he is what
// the deny cases are asserted against once the others are entangled.
const alice = randomUUID();
const bob = randomUUID();
const carol = randomUUID();
const dave = randomUUID();

/** Ids created by the fixtures, so teardown removes exactly what it made. */
const created = { profiles: [alice, bob, carol, dave], guests: [] };

before(async () => {
  if (!url) return;

  db = (await import("../src/lib/db/index.ts")).db;
  pool = (await import("../src/lib/db/index.ts")).pool;
  schema = await import("../src/lib/db/schema.ts");
  authz = await import("../src/lib/authz.ts");

  await db.insert(schema.profiles).values([
    { id: alice, email: `alice-${alice}@example.test`, role: "family" },
    { id: bob, email: `bob-${bob}@example.test`, role: "family" },
    { id: carol, email: `carol-${carol}@example.test`, role: "admin" },
    { id: dave, email: `dave-${dave}@example.test`, role: "family" },
  ]);
});

after(async () => {
  if (!url) return;
  // Sessions, shares and friendships cascade from guests and profiles.
  for (const id of created.guests) {
    await db.delete(schema.guests).where(eq(schema.guests.id, id));
  }
  for (const id of created.profiles) {
    await db.delete(schema.profiles).where(eq(schema.profiles.id, id));
  }
  await pool.end();
});

/**
 * A conversation belonging to `ownerId`. Returns its session id.
 *
 * One guest row per account, many sessions under it — the shape the app
 * actually creates, and the one `guests_user_idx` enforces.
 */
const guestByOwner = new Map();
async function makeConversation(ownerId, { status = "ready" } = {}) {
  let guestId = guestByOwner.get(ownerId);
  if (!guestId) {
    const [guest] = await db
      .insert(schema.guests)
      .values({ name: "Storyteller", userId: ownerId, origin: "self_serve" })
      .returning({ id: schema.guests.id });
    guestId = guest.id;
    guestByOwner.set(ownerId, guestId);
    created.guests.push(guestId);
  }

  const [session] = await db
    .insert(schema.sessions)
    .values({ guestId, status })
    .returning({ id: schema.sessions.id });
  return session.id;
}

async function befriend(a, b) {
  const { low, high } = friendshipPair(a, b);
  await db.insert(schema.friendships).values({
    userLow: low,
    userHigh: high,
    requesterId: a,
    status: "accepted",
  });
}

describeDb("a conversation is readable by its owner and nobody else", async () => {
  const session = await makeConversation(alice);

  assert.equal(await authz.ownsReadySession(alice, session), true);
  // The heart of it: Bob has a valid session of his own and is asking for a
  // real conversation id. Only the ownership check stands between them.
  assert.equal(await authz.ownsReadySession(bob, session), false);
  assert.equal(await authz.canReadOwnSession(bob, session), false);
});

describeDb("an admin does not inherit a storyteller's own conversations", async () => {
  const session = await makeConversation(alice);

  // `ownsReadySession` is about authorship, not privilege. Admin pages read
  // conversations through requireAdmin instead, which is a separate decision.
  assert.equal(await authz.isAdmin(carol), true);
  assert.equal(await authz.ownsReadySession(carol, session), false);
});

describeDb("a live conversation is not resumable, an abandoned one is", async () => {
  const live = await makeConversation(alice, { status: "recording" });
  await db
    .update(schema.sessions)
    .set({ lastCheckpointAt: new Date().toISOString() })
    .where(eq(schema.sessions.id, live));

  // Still checkpointing: someone is talking right now, so reopening the link
  // would walk in on them.
  assert.equal(await authz.canReadOwnSession(alice, live), false);

  // The same row, once the heartbeat has gone stale, is a closed tab to
  // recover.
  await db
    .update(schema.sessions)
    .set({ lastCheckpointAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
    .where(eq(schema.sessions.id, live));
  assert.equal(await authz.canReadOwnSession(alice, live), true);
});

describeDb("circle sharing needs both the switch and the friendship", async () => {
  const session = await makeConversation(alice);

  // Shared with nobody yet.
  assert.equal(await authz.readableCircleShare(bob, session), null);

  await db
    .insert(schema.circleShares)
    .values({ sessionId: session, ownerId: alice });

  // Switch on, but Bob is a stranger.
  assert.equal(await authz.readableCircleShare(bob, session), null);
  assert.equal(await authz.canReadCircleConversation(bob, session), false);

  await befriend(alice, bob);

  // Both halves present.
  assert.notEqual(await authz.readableCircleShare(bob, session), null);
  assert.equal(await authz.canReadCircleConversation(bob, session), true);

  // Revoking either half takes effect immediately, with no cached copy on the
  // share row to go stale.
  await db
    .delete(schema.circleShares)
    .where(eq(schema.circleShares.sessionId, session));
  assert.equal(await authz.readableCircleShare(bob, session), null);
  // The storyteller still sees their own comments after unsharing — hidden
  // from the circle rather than gone.
  assert.equal(await authz.canReadCircleConversation(alice, session), true);
});

describeDb("a pending request connects two people without sharing anything", async () => {
  const { low, high } = friendshipPair(alice, carol);
  await db.insert(schema.friendships).values({
    userLow: low,
    userHigh: high,
    requesterId: alice,
    status: "pending",
  });

  // isConnected is the wider one, so a pending requester's name can render.
  assert.equal(await authz.isConnected(alice, carol), true);
  // isFriend is what gates content, and a pending request is not consent.
  assert.equal(await authz.isFriend(alice, carol), false);

  const connected = await authz.filterConnected(alice, [carol, dave]);
  assert.equal(connected.has(carol), true);
  // Dave is a stranger, so his name is simply absent rather than an error —
  // which is how the profiles policy behaved for anyone you had not met.
  assert.equal(connected.has(dave), false);
});

describeDb("an anonymous walk-in has no owner to share with", async () => {
  const [guest] = await db
    .insert(schema.guests)
    .values({ name: "Walk-in", userId: null, origin: "public" })
    .returning({ id: schema.guests.id });
  created.guests.push(guest.id);
  const [session] = await db
    .insert(schema.sessions)
    .values({ guestId: guest.id, status: "ready" })
    .returning({ id: schema.sessions.id });

  // Null owner, not a wildcard: nobody may claim an anonymous conversation,
  // which is what keeps those out of circle sharing entirely.
  assert.equal(await authz.conversationOwner(session.id), null);
  assert.equal(await authz.canReadCircleConversation(alice, session.id), false);
  assert.equal(await authz.ownsReadySession(alice, session.id), false);
});
