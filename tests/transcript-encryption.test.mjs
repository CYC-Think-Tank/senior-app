import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

process.env.AUDIO_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const {
  decryptTurnText,
  decryptTurns,
  encryptTurnText,
  isEncryptedTurnText,
} = await import("../src/lib/transcript/encryption.ts");

const SESSION = randomUUID();
const OTHER_SESSION = randomUUID();

test("encrypting a turn round-trips and hides what was said", () => {
  const text = "My father built the house on Rue Saint-Denis in 1948.";
  const stored = encryptTurnText(SESSION, 0, text);

  assert.ok(isEncryptedTurnText(stored));
  assert.equal(stored.includes("Saint-Denis"), false);
  assert.equal(stored.includes("1948"), false);
  assert.equal(decryptTurnText(SESSION, 0, stored), text);
});

test("empty, long, and non-Latin turns round-trip", () => {
  for (const text of ["", "x".repeat(10_000), "外婆教我包粽子。", "🕯️ ok"]) {
    assert.equal(
      decryptTurnText(SESSION, 3, encryptTurnText(SESSION, 3, text)),
      text,
      JSON.stringify(text.slice(0, 20))
    );
  }
});

test("the same sentence twice does not produce the same ciphertext", () => {
  const text = "I never told anyone that.";
  assert.notEqual(
    encryptTurnText(SESSION, 0, text),
    encryptTurnText(SESSION, 0, text)
  );
});

test("a turn cannot be moved to another slot or another session", () => {
  const stored = encryptTurnText(SESSION, 4, "She said yes.");

  assert.throws(() => decryptTurnText(SESSION, 5, stored));
  assert.throws(() => decryptTurnText(OTHER_SESSION, 4, stored));
});

test("tampered ciphertext is rejected rather than decrypted", () => {
  const stored = encryptTurnText(SESSION, 0, "The will named my sister.");
  const raw = Buffer.from(stored.slice("FST1.".length), "base64url");
  raw[raw.length - 1] ^= 0xff;
  const forged = `FST1.${raw.toString("base64url")}`;

  assert.throws(() => decryptTurnText(SESSION, 0, forged));
  assert.throws(() => decryptTurnText(SESSION, 0, "FST1.short"));
});

test("plaintext from before encryption shipped still reads", () => {
  const legacy = "Written before the transcript was ever encrypted.";

  assert.equal(isEncryptedTurnText(legacy), false);
  assert.equal(decryptTurnText(SESSION, 0, legacy), legacy);
});

test("decryptTurns restores a query's rows in place", () => {
  const rows = ["first thing", "second thing"].map((text, idx) => ({
    idx,
    speaker: idx === 0 ? "ai" : "guest",
    text: encryptTurnText(SESSION, idx, text),
    start_ms: idx * 1000,
  }));

  assert.deepEqual(decryptTurns(SESSION, rows), [
    { idx: 0, speaker: "ai", text: "first thing", start_ms: 0 },
    { idx: 1, speaker: "guest", text: "second thing", start_ms: 1000 },
  ]);
});

test("a wrong key cannot read the transcript", async () => {
  process.env.AUDIO_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const other = await import(
    `../src/lib/transcript/encryption.ts?rekeyed=${Date.now()}`
  );

  assert.throws(() =>
    other.decryptTurnText(SESSION, 0, encryptTurnText(SESSION, 0, "secret"))
  );
});
