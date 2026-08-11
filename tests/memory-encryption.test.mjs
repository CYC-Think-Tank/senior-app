import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

process.env.AUDIO_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const {
  decryptGuestMemory,
  encryptGuestMemory,
  isEncryptedGuestMemory,
} = await import("../src/lib/memory/encryption.ts");

const GUEST = randomUUID();
const OTHER_GUEST = randomUUID();

test("guest memory is encrypted and round-trips", () => {
  const memory = JSON.stringify({
    interests: ["gardening"],
    currentActivities: ["growing tomatoes"],
  });
  const stored = encryptGuestMemory(GUEST, memory);

  assert.ok(isEncryptedGuestMemory(stored));
  assert.equal(stored.includes("tomatoes"), false);
  assert.equal(decryptGuestMemory(GUEST, stored), memory);
});

test("guest memory cannot be moved to another senior", () => {
  const stored = encryptGuestMemory(GUEST, "private continuity");

  assert.throws(() => decryptGuestMemory(OTHER_GUEST, stored));
});

test("plaintext and tampered guest memory are rejected", () => {
  assert.throws(() => decryptGuestMemory(GUEST, "plain summary"));

  const stored = encryptGuestMemory(GUEST, "private continuity");
  const raw = Buffer.from(stored.slice("FSM1.".length), "base64url");
  raw[raw.length - 1] ^= 0xff;
  assert.throws(() =>
    decryptGuestMemory(GUEST, `FSM1.${raw.toString("base64url")}`)
  );
});
