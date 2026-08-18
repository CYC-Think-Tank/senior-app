import assert from "node:assert/strict";
import test from "node:test";
import { transcriptionKeywords } from "../src/lib/realtime/transcription-keywords.ts";
import { transcriptionLanguage } from "../src/lib/i18n.ts";

test("the name, the sitting's topic and the profile topics all become hints", () => {
  assert.deepEqual(
    transcriptionKeywords({
      guestName: "Margaret Chen",
      topic: "The bakery on Grant Avenue",
      topics: ["Wartime Hong Kong", "Sailing"],
    }),
    [
      "Margaret Chen",
      "The bakery on Grant Avenue",
      "Wartime Hong Kong",
      "Sailing",
    ],
  );
});

test("characters that would be rejected by the API are stripped", () => {
  assert.deepEqual(
    transcriptionKeywords({ topics: ["a <b> c", "line\r\nbreak"] }),
    ["a b c", "line break"],
  );
});

test("blanks and repeats are dropped", () => {
  assert.deepEqual(
    transcriptionKeywords({
      guestName: "Sailing",
      topic: "   ",
      topics: ["sailing", "", "Fishing"],
    }),
    ["Sailing", "Fishing"],
  );
});

test("nothing to say produces no keywords rather than empty strings", () => {
  assert.deepEqual(transcriptionKeywords({}), []);
  assert.deepEqual(transcriptionKeywords({ guestName: null, topics: null }), []);
});

test("Cantonese transcribes as Cantonese, not Mandarin", () => {
  assert.equal(transcriptionLanguage("Cantonese"), "yue");
  assert.equal(transcriptionLanguage("Mandarin"), "zh");
  assert.equal(transcriptionLanguage("English"), "en");
  assert.equal(transcriptionLanguage(null), "en");
});
