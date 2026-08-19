import assert from "node:assert/strict";
import test from "node:test";

const {
  assembleNarrationSentences,
  buildSeedancePrompt,
  hasDetailedContinuityBible,
  hasNarratorPreamble,
  splitNarrationIntoScenes,
  storytellerTranscript,
} = await import(
  "../src/lib/memoir/story-helpers.ts"
);
const {
  MEMOIR_MAX_OUTPUT_SECONDS,
  MEMOIR_MAX_SCENES,
  MEMOIR_AUDIO_TRANSITION_SECONDS,
  MEMOIR_MIN_OUTPUT_SECONDS,
  MEMOIR_MIN_SCENES,
  MEMOIR_OUTPUT_FPS,
  MEMOIR_SCENE_DURATION_SECONDS,
  MEMOIR_TRANSITION_SECONDS,
  memoirOutputSeconds,
  memoirSceneCountForConversation,
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

test("Seedance prompt requires original family animation and one complete native-audio sentence", () => {
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
  assert.match(prompt, /SPEAK THESE WORDS EXACTLY ONCE/i);
  assert.match(prompt, /I still remember opening that gate/);
  assert.match(prompt, /at least one second of ambience only/i);
  assert.match(prompt, /first audible words must be exactly/i);
  assert.match(prompt, /Never greet the audience/i);
  assert.match(prompt, /ABSOLUTE IDENTITY LOCK/i);
  assert.match(prompt, /same NARRATOR_1 voice/i);
  assert.match(prompt, /Do not create a new voice/i);
  assert.match(prompt, /the bible wins/i);
  assert.doesNotMatch(prompt, /Generate no audio/i);
});

test("continuity bible requires detailed character, location, style, and voice locks", () => {
  const bible = `${"x".repeat(320)}\nCHARACTER LOCKS:\nLOCATION LOCKS:\nSTYLE LOCK:\nVOICE LOCK:`;
  assert.equal(hasDetailedContinuityBible(bible), true);
  assert.equal(hasDetailedContinuityBible("CHARACTER LOCKS: short"), false);
});

test("narrator role announcements are blocked before video generation", () => {
  assert.equal(hasNarratorPreamble("I am a narrator, and this is Linda's story."), true);
  assert.equal(hasNarratorPreamble("Hello, I'm your storyteller. Let us begin."), true);
  assert.equal(hasNarratorPreamble("大家好，我是一个AI旁白。"), true);
  assert.equal(hasNarratorPreamble("I still remember the bakery opening before sunrise."), false);
  assert.equal(hasNarratorPreamble("我仍記得清晨走進那間麵包店。"), false);
});

test("structured narration keeps one connected sentence assigned to each scene", () => {
  const sentences = [
    "Before sunrise, I unlocked the bakery beside the station",
    "My father lit the ovens while I swept flour from the floor",
    "Soon, the first customers pressed their faces against our cold window",
    "I carried warm loaves forward and learned each neighbor's usual order",
    "One winter morning, a storm left the whole street without power",
    "We kept baking by hand and shared every loaf before noon",
    "That quiet morning made the bakery feel like our neighborhood's kitchen",
    "Even now, fresh bread takes me back to that crowded counter",
  ];
  const narration = assembleNarrationSentences(sentences, 8, false);
  assert.deepEqual(splitNarrationIntoScenes(narration, 8), sentences.map((sentence) => `${sentence}.`));
});

test("structured narration rejects missing scene beats before paid video generation", () => {
  assert.throws(
    () => assembleNarrationSentences(["One scene only."], 8, false),
    /exactly 8 connected scene sentences/i,
  );
});

test("new memoir timing stays between 90 seconds and two minutes", () => {
  assert.equal(MEMOIR_MIN_SCENES, 7);
  assert.equal(MEMOIR_MAX_SCENES, 8);
  assert.ok(memoirOutputSeconds(MEMOIR_MIN_SCENES) >= MEMOIR_MIN_OUTPUT_SECONDS);
  assert.ok(memoirOutputSeconds(MEMOIR_MAX_SCENES) <= MEMOIR_MAX_OUTPUT_SECONDS);
  assert.equal(memoirOutputSeconds(MEMOIR_MIN_SCENES), 98);
  assert.equal(memoirOutputSeconds(MEMOIR_MAX_SCENES), 112);
  assert.equal(MEMOIR_MAX_OUTPUT_SECONDS, 2 * 60);
  assert.equal(memoirSceneCountForConversation(5 * 60 * 1000), 7);
  assert.equal(memoirSceneCountForConversation(8 * 60 * 1000), 8);
  assert.equal(memoirSceneCountForConversation(15 * 60 * 1000), 8);
});

test("renderer transitions video without touching master narration", () => {
  const plan = buildMemoirRenderPlan({
    sceneCount: 9,
    sceneDurationSeconds: MEMOIR_SCENE_DURATION_SECONDS,
    transitionSeconds: MEMOIR_TRANSITION_SECONDS,
    audioTransitionSeconds: MEMOIR_AUDIO_TRANSITION_SECONDS,
    width: 854,
    height: 480,
    frameRate: MEMOIR_OUTPUT_FPS,
    includeSceneAudio: false,
  });

  assert.equal(plan.durationSeconds, 120);
  assert.equal(plan.filter.match(/acrossfade=/g)?.length ?? 0, 0);
  assert.equal(plan.filter.match(/xfade=/g)?.length, 8);
  assert.equal(plan.filter.match(/fps=24/g)?.length, 9);
  assert.match(plan.filter, /format=yuv420p,fps=24\[v0\]/);
  assert.match(plan.filter, /\[vx8\]format=yuv420p\[videoout\]$/);
  assert.doesNotMatch(plan.filter, /concat=/);
  assert.equal(plan.audioLabel, null);
  assert.equal(plan.videoLabel, "videoout");
});

test("native SeeGen audio preserves every complete scene while visuals crossfade on padded handles", () => {
  const plan = buildMemoirRenderPlan({
    sceneCount: MEMOIR_MAX_SCENES,
    sceneDurationSeconds: MEMOIR_SCENE_DURATION_SECONDS,
    transitionSeconds: MEMOIR_TRANSITION_SECONDS,
    audioTransitionSeconds: MEMOIR_AUDIO_TRANSITION_SECONDS,
    width: 854,
    height: 480,
    frameRate: MEMOIR_OUTPUT_FPS,
    includeSceneAudio: true,
  });

  assert.equal(plan.durationSeconds, 112);
  assert.equal(plan.filter.match(/xfade=/g)?.length, 7);
  assert.equal(plan.filter.match(/acrossfade=/g)?.length, 7);
  assert.match(plan.filter, /trim=duration=14\.75/);
  assert.match(plan.filter, /apad=whole_dur=14\.25/);
  assert.match(plan.filter, /xfade=transition=fade:duration=0\.75:offset=14\[/);
  assert.match(plan.filter, new RegExp(`acrossfade=d=${MEMOIR_AUDIO_TRANSITION_SECONDS}`));
  assert.equal(plan.audioLabel, "ax7");
});

test("renderer can transition the already-paid legacy storyboard without its audio", () => {
  const plan = buildMemoirRenderPlan({
    sceneCount: 15,
    sceneDurationSeconds: 10,
    transitionSeconds: MEMOIR_TRANSITION_SECONDS,
    audioTransitionSeconds: MEMOIR_AUDIO_TRANSITION_SECONDS,
    width: 854,
    height: 480,
    frameRate: MEMOIR_OUTPUT_FPS,
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
    { length: 112 },
    (_, index) => `word-${index + 1}`,
  ).join(" ");
  const segments = splitNarrationIntoScenes(narration, MEMOIR_MAX_SCENES);

  assert.equal(segments.length, 8);
  assert.ok(segments.every((segment) => segment.split(/\s+/).length <= 16));
  assert.equal(segments.join(" "), narration);
});

test("Chinese narration is included exactly once and fits every scene", () => {
  const narration = "春夏秋冬".repeat(52);
  const segments = splitNarrationIntoScenes(narration, MEMOIR_MAX_SCENES);

  assert.equal(segments.length, 8);
  assert.ok(segments.every((segment) => Array.from(segment).length <= 30));
  assert.equal(segments.join(""), narration);
});

test("narration that cannot be spoken in the available scenes is rejected", () => {
  const narration = Array.from(
    { length: 129 },
    (_, index) => `word-${index + 1}`,
  ).join(" ");
  assert.throws(
    () => splitNarrationIntoScenes(narration, MEMOIR_MAX_SCENES),
    /too long to fit/i,
  );
});
