import assert from "node:assert/strict";
import test from "node:test";

const {
  buildSeedancePrompt,
  splitNarrationIntoScenes,
  storytellerTranscript,
} = await import(
  "../src/lib/memoir/story-helpers.ts"
);
const {
  MEMOIR_MAX_OUTPUT_SECONDS,
  MEMOIR_MAX_SCENES,
  MEMOIR_MIN_SCENES,
  MEMOIR_SCENE_DURATION_SECONDS,
} = await import("../src/lib/constants.ts");

test("storyteller source excludes interviewer and cut lines", () => {
  const turns = [
    { idx: 2, speaker: "guest", text: "Then I found the old bicycle.", excluded: false },
    { idx: 0, speaker: "ai", text: "Tell me about your childhood.", excluded: false },
    { idx: 1, speaker: "guest", text: "We lived beside the river.", excluded: false },
    { idx: 3, speaker: "guest", text: "This should be cut.", excluded: true },
  ];
  assert.equal(
    storytellerTranscript(turns),
    "We lived beside the river.\nThen I found the old bicycle.",
  );
});

test("Seedance prompt requires original family animation and SeeGen narration", () => {
  const prompt = buildSeedancePrompt(
    "blue coat, winter village",
    "The child opens the gate.",
    "I still remember opening that gate.",
  );
  assert.match(prompt, /family animation/i);
  assert.match(prompt, /No logos, captions, subtitles/i);
  assert.match(prompt, /blue coat, winter village/);
  assert.match(prompt, /The child opens the gate/);
  assert.match(prompt, /Generate synchronized audio/i);
  assert.match(prompt, /warm older storyteller/i);
  assert.match(prompt, /I still remember opening that gate/);
  assert.match(prompt, /Characters on screen must not speak/i);
});

test("memoir timing stays at two and a half minutes", () => {
  assert.equal(MEMOIR_MIN_SCENES, 15);
  assert.equal(MEMOIR_MAX_SCENES, 15);
  assert.equal(
    MEMOIR_MIN_SCENES * MEMOIR_SCENE_DURATION_SECONDS,
    MEMOIR_MAX_OUTPUT_SECONDS,
  );
  assert.ok(MEMOIR_MAX_OUTPUT_SECONDS >= 2 * 60);
  assert.ok(MEMOIR_MAX_OUTPUT_SECONDS <= 3 * 60);
});

test("English narration is included exactly once and fits every scene", () => {
  const narration = Array.from(
    { length: 240 },
    (_, index) => `word-${index + 1}`,
  ).join(" ");
  const segments = splitNarrationIntoScenes(narration, MEMOIR_MIN_SCENES);

  assert.equal(segments.length, 15);
  assert.ok(segments.every((segment) => segment.split(/\s+/).length <= 18));
  assert.equal(segments.join(" "), narration);
});

test("Chinese narration is included exactly once and fits every scene", () => {
  const narration = "春夏秋冬".repeat(90);
  const segments = splitNarrationIntoScenes(narration, MEMOIR_MIN_SCENES);

  assert.equal(segments.length, 15);
  assert.ok(segments.every((segment) => Array.from(segment).length <= 32));
  assert.equal(segments.join(""), narration);
});

test("narration that cannot be spoken in the available scenes is rejected", () => {
  const narration = Array.from(
    { length: 271 },
    (_, index) => `word-${index + 1}`,
  ).join(" ");
  assert.throws(
    () => splitNarrationIntoScenes(narration, MEMOIR_MIN_SCENES),
    /too long to fit/i,
  );
});
