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
  MEMOIR_TRANSITION_SECONDS,
} = await import("../src/lib/constants.ts");
const { buildMemoirRenderPlan } = await import(
  "../src/lib/memoir/render-plan.ts"
);
const { buildNarrationTimeline, wavDurationSeconds } = await import(
  "../src/lib/memoir/narration-plan.ts"
);

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

test("Seedance prompt requires original family animation and silent visuals", () => {
  const prompt = buildSeedancePrompt(
    "blue coat, winter village",
    "The child opens the gate.",
    "I still remember opening that gate.",
  );
  assert.match(prompt, /family animation/i);
  assert.match(prompt, /No logos, captions, subtitles/i);
  assert.match(prompt, /blue coat, winter village/);
  assert.match(prompt, /The child opens the gate/);
  assert.match(prompt, /Generate no audio/i);
  assert.match(prompt, /NARRATION CONTEXT FOR VISUAL TIMING ONLY/i);
  assert.match(prompt, /I still remember opening that gate/);
  assert.match(prompt, /separately generated master narration/i);
  assert.doesNotMatch(prompt, /Generate synchronized audio/i);
});

test("overlapped memoir timing stays at exactly two minutes", () => {
  assert.equal(MEMOIR_MIN_SCENES, 9);
  assert.equal(MEMOIR_MAX_SCENES, 9);
  assert.equal(
    MEMOIR_MIN_SCENES * MEMOIR_SCENE_DURATION_SECONDS -
      (MEMOIR_MIN_SCENES - 1) * MEMOIR_TRANSITION_SECONDS,
    MEMOIR_MAX_OUTPUT_SECONDS,
  );
  assert.equal(MEMOIR_MAX_OUTPUT_SECONDS, 2 * 60);
});

test("renderer transitions video without touching master narration", () => {
  const plan = buildMemoirRenderPlan({
    sceneCount: MEMOIR_MIN_SCENES,
    sceneDurationSeconds: MEMOIR_SCENE_DURATION_SECONDS,
    transitionSeconds: MEMOIR_TRANSITION_SECONDS,
    width: 854,
    height: 480,
    includeSceneAudio: false,
  });

  assert.equal(plan.durationSeconds, 120);
  assert.equal(plan.filter.match(/acrossfade=/g)?.length ?? 0, 0);
  assert.equal(plan.filter.match(/xfade=/g)?.length, 8);
  assert.doesNotMatch(plan.filter, /concat=/);
  assert.equal(plan.audioLabel, null);
  assert.equal(plan.videoLabel, "vx8");
});

test("renderer can transition the already-paid legacy storyboard without its audio", () => {
  const plan = buildMemoirRenderPlan({
    sceneCount: 15,
    sceneDurationSeconds: 10,
    transitionSeconds: MEMOIR_TRANSITION_SECONDS,
    width: 854,
    height: 480,
    includeSceneAudio: false,
  });

  assert.equal(plan.durationSeconds, 139.5);
  assert.equal(plan.filter.match(/xfade=/g)?.length, 14);
  assert.equal(plan.filter.match(/acrossfade=/g)?.length ?? 0, 0);
});

test("master narration keeps every complete sentence inside its matching scene", () => {
  const timeline = buildNarrationTimeline({
    segmentDurationsSeconds: Array(9).fill(8),
    sceneDurationSeconds: MEMOIR_SCENE_DURATION_SECONDS,
    transitionSeconds: MEMOIR_TRANSITION_SECONDS,
  });

  assert.equal(timeline.durationSeconds, 120);
  assert.equal(timeline.safeWindowSeconds, 12.5);
  for (const [index, segment] of timeline.segments.entries()) {
    const safeStart = index * timeline.sceneStepSeconds + timeline.overlapSeconds;
    const safeEnd = safeStart + timeline.safeWindowSeconds;
    assert.ok(segment.delaySeconds >= safeStart);
    assert.ok(segment.delaySeconds + segment.effectiveDurationSeconds <= safeEnd);
    assert.equal(segment.tempo, 1);
  }
});

test("long narration is sped up gently rather than cut mid-word", () => {
  const timeline = buildNarrationTimeline({
    segmentDurationsSeconds: [15],
    sceneDurationSeconds: 14,
    transitionSeconds: 0.75,
  });
  assert.equal(timeline.segments[0].sourceDurationSeconds, 15);
  assert.ok(timeline.segments[0].effectiveDurationSeconds <= 14);
  assert.ok(timeline.segments[0].tempo > 1);

  assert.throws(
    () => buildNarrationTimeline({
      segmentDurationsSeconds: [20],
      sceneDurationSeconds: 14,
      transitionSeconds: 0.75,
    }),
    /too long for its matching visual scene/i,
  );
});

test("narration WAV duration is read from its audio data", () => {
  const byteRate = 48_000;
  const dataBytes = byteRate * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24_000, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataBytes, 40);
  assert.equal(wavDurationSeconds(wav), 2);

  wav.writeUInt32LE(0xffffffff, 4);
  wav.writeUInt32LE(0xffffffff, 40);
  assert.equal(wavDurationSeconds(wav), 2);
});

test("English narration is included exactly once and fits every scene", () => {
  const narration = Array.from(
    { length: 207 },
    (_, index) => `word-${index + 1}`,
  ).join(" ");
  const segments = splitNarrationIntoScenes(narration, MEMOIR_MIN_SCENES);

  assert.equal(segments.length, 9);
  assert.ok(segments.every((segment) => segment.split(/\s+/).length <= 24));
  assert.equal(segments.join(" "), narration);
});

test("Chinese narration is included exactly once and fits every scene", () => {
  const narration = "春夏秋冬".repeat(99);
  const segments = splitNarrationIntoScenes(narration, MEMOIR_MIN_SCENES);

  assert.equal(segments.length, 9);
  assert.ok(segments.every((segment) => Array.from(segment).length <= 46));
  assert.equal(segments.join(""), narration);
});

test("narration that cannot be spoken in the available scenes is rejected", () => {
  const narration = Array.from(
    { length: 217 },
    (_, index) => `word-${index + 1}`,
  ).join(" ");
  assert.throws(
    () => splitNarrationIntoScenes(narration, MEMOIR_MIN_SCENES),
    /too long to fit/i,
  );
});
