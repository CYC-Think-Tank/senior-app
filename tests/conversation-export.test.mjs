import assert from "node:assert/strict";
import test from "node:test";
import {
  audioExtension,
  conversationArchiveFolder,
  conversationDetails,
  conversationTranscript,
  safeArchiveSegment,
} from "../src/lib/conversation-export.ts";

const conversation = {
  id: "12345678-abcd-4321-abcd-123456789012",
  name: "Early life / first job",
  guestName: "Margaret",
  title: null,
  topic: "First job",
  status: "ready",
  createdAt: "2026-07-30T12:00:00.000Z",
  startedAt: "2026-07-30T12:01:00.000Z",
  durationMs: 5_000,
  rawAudioPath: "123/session-recording.webm",
  turns: [
    {
      idx: 1,
      speaker: "guest",
      text: "My first job was at the bakery.",
      startMs: 2_000,
      endMs: 5_000,
      excluded: true,
    },
    {
      idx: 0,
      speaker: "ai",
      text: "What was your first job?",
      startMs: 0,
      endMs: 2_000,
      excluded: false,
    },
  ],
};

test("makes conversation titles safe and unique as ZIP folders", () => {
  assert.equal(
    conversationArchiveFolder(conversation),
    "2026-07-30 - Early life - first job - 12345678",
  );
  assert.equal(safeArchiveSegment("../\u0000", "Conversation"), "Conversation");
});

test("keeps known audio extensions and falls back safely", () => {
  assert.equal(audioExtension("recordings/story.M4A"), ".m4a");
  assert.equal(audioExtension("recordings/story"), ".webm");
});

test("exports transcripts in speaking order with edit state", () => {
  const transcript = conversationTranscript(conversation, "en");

  assert.ok(
    transcript.indexOf("What was your first job?") <
      transcript.indexOf("My first job was at the bakery."),
  );
  assert.match(transcript, /Rosie/);
  assert.match(transcript, /Margaret \[excluded from episode\]/);
});

test("exports useful metadata without leaking the storage path", () => {
  const details = conversationDetails(conversation);
  const parsed = JSON.parse(details);

  assert.equal(parsed.hasAudio, true);
  assert.equal(parsed.transcriptTurnCount, 2);
  assert.doesNotMatch(details, /session-recording/);
});
