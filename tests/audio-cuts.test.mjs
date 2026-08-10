import assert from "node:assert/strict";
import test from "node:test";

const {
  editedAudioDurationMs,
  editedToOriginalTimeMs,
  mergeAudioCuts,
  originalToEditedTimeMs,
  skipDeletedTimeMs,
} = await import("../src/lib/audio/cuts.ts");

test("audio cuts are sorted, clamped, and merged", () => {
  assert.deepEqual(
    mergeAudioCuts(
      [
        { startMs: 8_000, endMs: 12_000 },
        { startMs: -500, endMs: 1_000 },
        { startMs: 6_000, endMs: 9_000 },
        { startMs: 4_000, endMs: 4_000 },
      ],
      10_000,
    ),
    [
      { startMs: 0, endMs: 1_000 },
      { startMs: 6_000, endMs: 10_000 },
    ],
  );
});

test("edited duration removes every merged cut exactly once", () => {
  const cuts = mergeAudioCuts([
    { startMs: 2_000, endMs: 5_000 },
    { startMs: 4_000, endMs: 7_000 },
    { startMs: 9_000, endMs: 10_000 },
  ]);
  assert.equal(editedAudioDurationMs(12_000, cuts), 6_000);
  assert.equal(editedAudioDurationMs(null, cuts), null);
});

test("player positions map across deleted transcript ranges", () => {
  const cuts = mergeAudioCuts([
    { startMs: 2_000, endMs: 5_000 },
    { startMs: 8_000, endMs: 9_000 },
  ]);

  assert.equal(originalToEditedTimeMs(1_000, cuts), 1_000);
  assert.equal(originalToEditedTimeMs(3_000, cuts), 2_000);
  assert.equal(originalToEditedTimeMs(7_000, cuts), 4_000);
  assert.equal(editedToOriginalTimeMs(1_000, 12_000, cuts), 1_000);
  assert.equal(editedToOriginalTimeMs(2_000, 12_000, cuts), 5_000);
  assert.equal(editedToOriginalTimeMs(5_000, 12_000, cuts), 9_000);
  assert.equal(editedToOriginalTimeMs(8_000, 12_000, cuts), 12_000);
});

test("playback jumps to the end of a deleted line", () => {
  const cuts = mergeAudioCuts([{ startMs: 2_000, endMs: 5_000 }]);
  assert.equal(skipDeletedTimeMs(1_999, cuts), 1_999);
  assert.equal(skipDeletedTimeMs(2_000, cuts), 5_000);
  assert.equal(skipDeletedTimeMs(4_999, cuts), 5_000);
  assert.equal(skipDeletedTimeMs(5_000, cuts), 5_000);
});
