import OpenAI from "openai";
import {
  CHAT_MODEL,
  MEMOIR_SCENE_DURATION_SECONDS,
} from "@/lib/constants";
import type { TranscriptTurn } from "@/lib/types";
import {
  assembleNarrationSentences,
  buildSeedancePrompt,
  hasDetailedContinuityBible,
  hasNarratorPreamble,
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
              "Extract the storyteller's concrete memories, events, people, setting, emotional arc, and chronology. Group details by episode and preserve what led to what; never merge unrelated memories into one event. Keep distinctive wording when useful, and do not invent or embellish anything. Return JSON with one string field named facts.",
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
  sceneCount,
  turns,
}: {
  guestName: string;
  language: string;
  sceneCount: number;
  turns: TranscriptTurn[];
}): Promise<MemoirStory> {
  const transcript = storytellerTranscript(turns);
  if (!transcript) throw new Error("This conversation has no storyteller transcript to adapt.");

  const openai = new OpenAI();
  const source = await condenseLongTranscript(openai, transcript);
  // interviewLanguage() names the spoken variety, not the script, so a
  // Cantonese or Mandarin memoir never contains the word "Chinese".
  const spokenLanguage = language.toLowerCase();
  const isChinese =
    spokenLanguage.includes("chinese") ||
    spokenLanguage.includes("cantonese") ||
    spokenLanguage.includes("mandarin");
  const narrationLength = isChinese
    ? `exactly ${sceneCount} short first-person sentences, one per array item, totaling ${sceneCount * 18}–${sceneCount * 26} Chinese characters; keep every item at 30 characters or fewer`
    : `exactly ${sceneCount} short first-person sentences, one per array item, totaling ${sceneCount * 10}–${sceneCount * 14} words; keep every item at 16 words or fewer`;
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a careful memoir editor. Shape an oral-history transcript into one faithful, natural story narrated by a warm older storyteller.

Return JSON with exactly this structure:
{"title":"...","story_plan":{"central_episode":"...","ordered_beats":["..."],"moral":"..."},"story":"...","narration_sentences":["..."],"visual_bible":"..."}

Rules:
- Use only facts present in the storyteller source. Never invent events, quotations, motives, or physical details.
- The interviewer has already been removed. Never mention an interview, host, question, recording, or transcript.
- Write in ${language}, matching the storyteller's natural language.
- First choose one central episode with the strongest sequence of actions, people, setting, and change. If the source contains unrelated memories, leave the weaker ones out instead of cramming them together.
- story_plan.central_episode: one plain factual sentence naming that episode. story_plan.ordered_beats: exactly ${sceneCount} short factual beats from that same episode, in chronological or clearly signposted causal order.
- The first beat must open inside a concrete moment. The middle beats must show what happened next and how the storyteller responded. The last beat must express a clear moral grounded in the episode's specific outcome.
- story_plan.moral: one plain, specific lesson the event supports. Do not invent a belief or quote for the storyteller. Avoid universal claims and generic advice.
- Every beat must connect to the beat before it through the same person, action, object, place, or an explicit passage of time. Do not jump to a new subject, place, or decade without a short transition.
- story: a compact first-person short story that follows the plan. Build the setting before referring to people or objects, keep cause before consequence, and retain the storyteller's specific wording and human rhythm where possible.
- narration_sentences: ${narrationLength}. Follow the ordered beats exactly, so each item continues the same story rather than acting as an independent caption. It will be spoken by a disclosed synthetic narrator, not by ${guestName}.
- The final narration_sentences item must deliver story_plan.moral in the storyteller's natural voice while referring back to a concrete detail from the episode. Do not append a separate moral sentence.
- Begin narration immediately inside the memory itself. Never greet the audience, introduce the story, identify the speaker, mention being a narrator or storyteller, or use any meta-narration such as "I am a narrator" or an equivalent phrase in another language.
- Prefer simple spoken language and concrete actions. Avoid biography summaries, lists of life events, repeated "I remember" openings, generic nostalgia, forced lessons, and stock phrases such as "a journey," "a tapestry," "shaped who I am," "a lesson I carry," or "cherished memories."
- End naturally with the clear moral. Tie it to a person, action, object, or outcome already shown, so it feels earned rather than added as a slogan.
- title: specific and evocative, no more than eight words.
- visual_bible: a detailed production bible of at least 320 characters. It must use the exact English headings CHARACTER LOCKS:, LOCATION LOCKS:, STYLE LOCK:, and VOICE LOCK:, although the descriptions may use ${language}.
- Under CHARACTER LOCKS, assign each recurring person a permanent ID such as CHARACTER_1. Lock apparent age, face shape, skin tone, eyes, nose, mouth, hairline, hairstyle and color, build, posture, full clothing with exact colors and materials, footwear, and accessories. Repeat distinctive source details. When the source omits a visual trait, make one neutral artistic design choice here and never treat it as a story fact.
- Under LOCATION LOCKS, fix layout, era, season, time of day, architecture, furniture, important props, and where recurring objects sit. Under STYLE LOCK, fix palette, materials, lighting, lens language, and 3D character treatment.
- Under VOICE LOCK, copy this exact identity: NARRATOR_1; one synthetic older off-screen storyteller; warm medium-low register; soft dry timbre; clear relaxed diction; unhurried conversational pace; restrained emotion; gentle natural breath; steady volume; the same ${language} accent and pronunciation throughout.
- Do not imitate or mention any entertainment company, franchise, trademarked character, or existing film.`,
      },
      { role: "user", content: source },
    ],
  });
  const parsed = parseJson(completion.choices[0]?.message?.content);
  const plan = parsed.story_plan as Record<string, unknown> | undefined;
  const orderedBeats = Array.isArray(plan?.ordered_beats)
    ? plan.ordered_beats.map((beat) => String(beat ?? "").trim()).filter(Boolean)
    : [];
  if (
    !String(plan?.central_episode ?? "").trim()
    || !String(plan?.moral ?? "").trim()
    || orderedBeats.length !== sceneCount
  ) {
    throw new Error("The story model could not build one complete, connected memoir arc.");
  }
  const story = String(parsed.story ?? "").trim();
  const narration = assembleNarrationSentences(
    parsed.narration_sentences,
    sceneCount,
    isChinese,
  );
  if (!story || !narration) throw new Error("The story model could not find a complete memoir in this conversation.");
  if (hasNarratorPreamble(narration)) {
    throw new Error("The memoir script introduced its narrator instead of beginning with the story.");
  }
  const visualBible = String(parsed.visual_bible ?? "").trim();
  if (!hasDetailedContinuityBible(visualBible)) {
    throw new Error("The story model did not provide detailed character, location, style, and voice locks.");
  }
  return {
    title: String(parsed.title ?? "A Memory Worth Keeping").trim().slice(0, 160),
    story,
    narration,
    visualBible,
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
        content: `Create exactly ${sceneCount} chronological visual beats for one narrated animated memoir. Return JSON {"scenes":[{"description":"..."}]}. Each description must be a detailed 90-to-140-word plan for one continuous ${MEMOIR_SCENE_DURATION_SECONDS}-second cinematic shot corresponding to the same-numbered voiceover segment. Name every visible recurring person by the permanent CHARACTER ID from the continuity bible, then restate that character's locked face, hair, body, complete wardrobe, and accessories inside every scene where they appear. Specify the opening pose, action progression, natural facial acting, hand movement, exact props, spatial blocking, environment, camera framing and movement, lens feel, lighting direction, palette, background motion, and final frame. Treat every shot as the direct visual continuation of the one before it, carrying forward people, action, place, screen direction, wardrobe, and props unless narration clearly signals a transition. Across all scenes, show the complete cause-and-effect sequence in order. Avoid disconnected montage images, repeated introductions, dialogue, and text. The continuity bible overrides all other wording. Do not add story facts.`,
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
    if (description.length < 300) {
      throw new Error(`Storyboard scene ${index + 1} is not detailed enough to preserve continuity.`);
    }
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
