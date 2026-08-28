import assert from "node:assert/strict";
import test from "node:test";
import {
  friendshipPair,
  otherParticipant,
  requestDirection,
} from "../src/lib/friends.ts";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";

test("friendshipPair orders the two ids the same way from either side", () => {
  const fromAlice = friendshipPair(alice, bob);
  const fromBob = friendshipPair(bob, alice);

  assert.deepEqual(fromAlice, { low: alice, high: bob });
  // This is what makes the unique index reject a reciprocal request rather
  // than storing it as a second, crossed row.
  assert.deepEqual(fromAlice, fromBob);
});

test("friendshipPair orders by byte value, the way Postgres compares uuid", () => {
  // Postgres compares uuid with memcmp over the raw bytes, so 'a' > '9'.
  // Raw JS string comparison of a mixed-case id would disagree, and the
  // friendships_ordered check constraint would then reject the insert.
  const upper = "AAAAAAAA-1111-4111-8111-111111111111";
  const digits = "99999999-1111-4111-8111-111111111111";

  assert.deepEqual(friendshipPair(upper, digits), {
    low: digits,
    high: upper.toLowerCase(),
  });
  // And it still agrees with itself whichever way round it is asked.
  assert.deepEqual(
    friendshipPair(upper, digits),
    friendshipPair(digits, upper),
  );
});

test("otherParticipant returns the person who is not me, from either slot", () => {
  const row = { userLow: alice, userHigh: bob };
  assert.equal(otherParticipant(row, alice), bob);
  assert.equal(otherParticipant(row, bob), alice);
});

test("requestDirection is outgoing for the requester and incoming for the other", () => {
  const row = { requesterId: alice };
  assert.equal(requestDirection(row, alice), "outgoing");
  assert.equal(requestDirection(row, bob), "incoming");
});
