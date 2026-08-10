import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

process.env.AUDIO_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { decryptMemoirText, encryptMemoirText } = await import(
  "../src/lib/memoir/encryption.ts"
);

test("memoir text is encrypted and bound to its video and field", () => {
  const videoId = randomUUID();
  const stored = encryptMemoirText(videoId, "story", "I crossed the ocean in 1962.");
  assert.equal(stored.includes("crossed the ocean"), false);
  assert.equal(decryptMemoirText(videoId, "story", stored), "I crossed the ocean in 1962.");
  assert.throws(() => decryptMemoirText(videoId, "narration", stored));
  assert.throws(() => decryptMemoirText(randomUUID(), "story", stored));
});

test("legacy plaintext remains readable", () => {
  assert.equal(decryptMemoirText(randomUUID(), "story", "plain story"), "plain story");
});
