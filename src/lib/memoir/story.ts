import OpenAI from "openai";
import { CHAT_MODEL, MEMOIR_SCENE_DURATION_SECONDS } from "@/lib/constants";
import type { TranscriptTurn } from "@/lib/types";
import {
  buildSeedancePrompt,
  splitNarrationIntoScenes,
  storytellerTranscript,
} from "./story-helpers";

export {
  buildSeedancePrompt,
  splitNarrationIntoScenes,
  storytellerTranscript,
} from "./story-helpers";

export type MemoirStory = {
  title: string;
  story: string;
  narration: string;
  visualBible: string;
};

export type MemoirScene = {
  description: string;
  prompt: string;
};

const MAX_SOURCE_CHARS = 60_000;

function parseJson(content: string | null): Record<string, unknown> {
  if (!content) throw new Error("The story model returned no content.");
  return JSON.parse(content) as Record<string, unknown>;
}

async function condenseLongTranscript(openai: OpenAI, transcript: string) {
  if (transcript.length <= MAX_SOURCE_CHARS) return transcript;
  const chunks: string[] = [];
  for (let at = 0; at < transcript.length; at += MAX_SOURCE_CHARS) {
    chunks.push(transcript.slice(at, at + MAX_SOURCE_CHARS));
  }
  const summaries = await Promise.all(
    chunks.map(async (chunk, index) => {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extract the storyteller's concrete memories, events, people, setting, emotional arc, and chronology. Preserve important details and do not invent or embellish anything. Return JSON with one string field named facts.",
          },
          { role: "user", content: `Transcript section ${index + 1}:\n${chunk}` },
        ],
      });
      const parsed = parseJson(completion.choices[0]?.message?.content);
      return String(parsed.facts ?? "");
    }),
  );
  return summaries.join("\n\n");
}

export async function generateMemoirStory({
  guestName,
  language,
  turns,
}: {
  guestName: string;
  language: string;
  turns: TranscriptTurn[];
}): Promise<MemoirStory> {
  const transcript = storytellerTranscript(turns);
  if (!transcript) throw new Error("This conversation has no storyteller transcript to adapt.");

  const openai = new OpenAI();
  const source = await condenseLongTranscript(openai, transcript);
  const spokenLanguage = language.toLowerCase();
  const isChinese =
    spokenLanguage.includes("chinese") ||
    spokenLanguage.includes("cantonese") ||
    spokenLanguage.includes("mandarin");
  const narrationLength = isChinese
    ? "exactly 15 short sentences totaling 330–420 Chinese characters"
    : "exactly 15 short sentences totaling 180–255 words; keep every sentence at 17 words or fewer";
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You adapt an oral-history transcript into a faithful animated memoir narrated by a warm older storyteller.

Return JSON with exactly these string fields: title, story, narration, visual_bible.

Rules:
- Use only facts present in the storyteller source. Never invent events, quotations, motives, or physical details.
- The interviewer has already been removed. Never mention an interview, host, question, recording, or transcript.
- Write in ${language}, matching the storyteller's natural language.
- story: a compact first-person short story focused on the single main story or strongest connected arc.
- narration: ${narrationLength}, first person, speech-friendly, warm and reflective, with a clear beginning, middle, and ending. It will be spoken by SeeGen's generated audio, not by ${guestName}.
- title: specific and evocative, no more than eight words.
- visual_bible: a concise continuity guide for recurring characters, ages at the time of the memory, clothing, locations, season, era, palette, and props. Describe only details supported by the source; keep unspecified traits generic.
- Do not imitate or mention any entertainment company, franchise, trademarked character, or existing film.`,
      },
      { role: "user", content: source },
    ],
  });
  const parsed = parseJson(completion.choices[0]?.message?.content);
  const story = String(parsed.story ?? "").trim();
  const narration = String(parsed.narration ?? "").trim();
  if (!story || !narration) throw new Error("The story model could not find a complete memoir in this conversation.");
  return {
    title: String(parsed.title ?? "A Memory Worth Keeping").trim().slice(0, 160),
    story,
    narration,
    visualBible: String(parsed.visual_bible ?? "").trim(),
  };
}

export async function generateMemoirStoryboard({
  story,
  narration,
  visualBible,
  sceneCount,
}: MemoirStory & { sceneCount: number }): Promise<MemoirScene[]> {
  const openai = new OpenAI();
  const narrationSegments = splitNarrationIntoScenes(narration, sceneCount);
  const numberedNarration = narrationSegments
    .map((segment, index) => `SCENE ${index + 1}: ${segment}`)
    .join("\n");
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Create exactly ${sceneCount} chronological visual beats for a narrated animated memoir. Return JSON {"scenes":[{"description":"..."}]}. Each description must be a single self-contained ${MEMOIR_SCENE_DURATION_SECONDS}-second cinematic shot corresponding to the same-numbered voiceover segment. Across all scenes, cover the complete story in order. Avoid dialogue and text, respect the supplied continuity, and do not add facts.`,
      },
      {
        role: "user",
        content: `STORY:\n${story}\n\nNUMBERED VOICEOVER SEGMENTS:\n${numberedNarration}\n\nCONTINUITY:\n${visualBible}`,
      },
    ],
  });
  const parsed = parseJson(completion.choices[0]?.message?.content);
  const raw = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  if (raw.length !== sceneCount) throw new Error("The storyboard did not return the required number of scenes.");
  return raw.map((item, index) => {
    const description = String((item as Record<string, unknown>).description ?? "").trim();
    if (!description) throw new Error(`Storyboard scene ${index + 1} is empty.`);
    return {
      description,
      prompt: buildSeedancePrompt(
        visualBible,
        description,
        narrationSegments[index],
      ),
    };
  });
}
