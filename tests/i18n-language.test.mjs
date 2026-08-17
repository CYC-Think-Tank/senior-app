import assert from "node:assert/strict";
import test from "node:test";
import {
  dictionaries,
  interviewLanguage,
  localeForInterviewLanguage,
} from "../src/lib/i18n.ts";
import { buildInterviewerInstructions } from "../src/lib/realtime/interviewer-prompt.ts";

test("Simplified Chinese starts a Mandarin interview", () => {
  assert.equal(interviewLanguage("zh-Hans"), "Mandarin");
  assert.equal(localeForInterviewLanguage("Mandarin"), "zh-Hans");
  assert.equal(dictionaries["zh-Hans"].interviewNameQuestion, "我该怎么称呼您？");
  assert.match(
    buildInterviewerInstructions({ guestName: "林女士", language: "Mandarin" }),
    /Conduct the entire conversation in Mandarin/,
  );
});

test("Traditional Chinese starts a Cantonese interview", () => {
  assert.equal(interviewLanguage("zh-Hant"), "Cantonese");
  assert.equal(localeForInterviewLanguage("Cantonese"), "zh-Hant");
  assert.equal(dictionaries["zh-Hant"].interviewNameQuestion, "我該怎麼稱呼您？");
  assert.match(
    buildInterviewerInstructions({ guestName: "陳女士", language: "Cantonese" }),
    /Conduct the entire conversation in Cantonese/,
  );
});

test("English keeps the English interview", () => {
  assert.equal(interviewLanguage("en"), "English");
  assert.equal(localeForInterviewLanguage("English"), "en");
});
