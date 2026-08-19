type StoryTurn = {
  idx: number;
  speaker: "ai" | "guest";
  text: string;
  excluded: boolean;
};

/** Keeps the video-writing model entirely outside the interviewer's words. */
export function storytellerTranscript(turns: StoryTurn[]): string {
  return turns
    .filter((turn) => turn.speaker === "guest" && !turn.excluded)
    .sort((a, b) => a.idx - b.idx)
    .map((turn) => turn.text.trim())
    .filter(Boolean)
    .join("\n");
}

/** New storyboards are silent; this marker also distinguishes retry layouts. */
export const SEEGEN_SILENT_PROMPT_MARKER = "AUDIO DIRECTION: Generate no audio";
/** Native-audio storyboards keep one complete spoken sentence per clip. */
export const LEGACY_SEEGEN_AUDIO_PROMPT_MARKER = "AUDIO DIRECTION: Generate synchronized audio";

/** Rejects role announcements before they can become paid video scenes. */
export function hasNarratorPreamble(narration: string) {
  const opening = narration.trim().slice(0, 220).toLowerCase().replaceAll("’", "'");
  return /^(?:hello|hi|welcome)[,!\s]*(?:i am|i'm|this is)\s+(?:(?:your|the|an?|ai|artificial intelligence|synthetic)\s+)*(?:narrator|storyteller|narrating voice)\b/u.test(opening)
    || /^(?:i am|i'm|this is|as)\s+(?:(?:your|the|an?|ai|artificial intelligence|synthetic)\s+)*(?:narrator|storyteller|narrating voice)\b/u.test(opening)
    || /^(?:大家好[，,!。.]*)?(?:我是|作為|作为)(?:你们的|你們的|您的|一個|一个|一名|ai|人工智能|人工智慧)*(?:旁白|讲述者|講述者|叙述者|敘述者)/u.test(opening);
}

const CONTINUITY_SECTIONS = [
  "CHARACTER LOCKS:",
  "LOCATION LOCKS:",
  "STYLE LOCK:",
  "VOICE LOCK:",
] as const;

/** Requires reusable identity anchors before any paid scene is submitted. */
export function hasDetailedContinuityBible(value: string) {
  return value.trim().length >= 320
    && CONTINUITY_SECTIONS.every((section) => value.includes(section));
}

/**
 * Keeps the writer model's scene beats intact instead of redistributing a
 * paragraph after generation. Each array item becomes exactly one scene.
 */
export function assembleNarrationSentences(
  value: unknown,
  sceneCount: number,
  isChinese: boolean,
) {
  if (!Array.isArray(value) || value.length !== sceneCount) {
    throw new Error(`The memoir script must contain exactly ${sceneCount} connected scene sentences.`);
  }

  const sentences = value.map((item, index) => {
    const sentence = String(item ?? "").trim();
    if (!sentence) throw new Error(`Memoir scene sentence ${index + 1} is empty.`);
    if (/[.!?。！？][\s\S]+[.!?。！？]["'\u201d\u2019)]?$/u.test(sentence)) {
      throw new Error(`Memoir scene ${index + 1} contains more than one sentence.`);
    }
    if (/[.!?。！？]["'\u201d\u2019)]?$/u.test(sentence)) return sentence;
    return `${sentence}${isChinese ? "。" : "."}`;
  });

  const narration = sentences.join(isChinese ? "" : " ");
  const segments = splitNarrationIntoScenes(narration, sceneCount);
  if (segments.length !== sceneCount) {
    throw new Error("The memoir script could not be aligned to its scene plan.");
  }
  return narration;
}

function usesCjkNarration(narration: string) {
  const compact = Array.from(narration).filter((character) => !/\s/u.test(character));
  if (!compact.length) return false;
  const cjk = compact.filter((character) =>
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character),
  );
  return cjk.length / compact.length >= 0.4;
}

/**
 * Gives every generated scene one short, complete narration sentence. The
 * generous remaining time becomes a safe native-audio handle around joins.
 */
export function splitNarrationIntoScenes(narration: string, sceneCount: number) {
  const trimmed = narration.trim();
  if (!trimmed) throw new Error("The memoir narration is empty.");
  if (!Number.isInteger(sceneCount) || sceneCount < 1) {
    throw new Error("The memoir must have at least one scene.");
  }

  const cjk = usesCjkNarration(trimmed);
  const units = cjk
    ? Array.from(trimmed).filter((character) => !/\s/u.test(character))
    : trimmed.split(/\s+/u);
  if (units.length < sceneCount) {
    throw new Error("The memoir narration is too short to cover every scene.");
  }

  const maxUnitsPerScene = cjk ? 30 : 16;
  if (units.length > sceneCount * maxUnitsPerScene) {
    throw new Error("The memoir narration is too long to fit inside the film.");
  }

  // The story prompt asks for one short sentence per scene. Preserve those
  // natural boundaries when the model follows that structure; the balanced
  // fallback below still guarantees timing if its punctuation is irregular.
  const sentences = trimmed
    .match(/[^.!?。！？]+(?:[.!?。！？]+|$)/gu)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences?.length === sceneCount) {
    const allFit = sentences.every((sentence) => {
      const sentenceUnits = cjk
        ? Array.from(sentence).filter((character) => !/\s/u.test(character))
        : sentence.split(/\s+/u);
      return sentenceUnits.length <= maxUnitsPerScene;
    });
    if (allFit) return sentences;
  }

  const segments: string[] = [];
  for (let index = 0, at = 0; index < sceneCount; index++) {
    const remainingUnits = units.length - at;
    const remainingScenes = sceneCount - index;
    const size = Math.ceil(remainingUnits / remainingScenes);
    const segment = units.slice(at, at + size);
    segments.push(cjk ? segment.join("") : segment.join(" "));
    at += size;
  }
  return segments;
}

export function buildSeedancePrompt(
  visualBible: string,
  description: string,
  narration: string,
) {
  return `Create one continuous shot for an animated family memoir.

ABSOLUTE IDENTITY LOCK: This shot belongs to one continuous film. Every recurring person must be the exact same character model seen in every other shot, not a similar replacement. Preserve the character ID, apparent age, facial structure, skin tone, eye shape and color, nose, mouth, hairline, hairstyle, hair color, body proportions, clothing cut, fabric, colors, footwear, jewelry, and carried objects exactly as written below. Never redesign, age, de-age, recast, change ethnicity, change wardrobe, swap colors, add facial hair, remove accessories, or mirror distinctive features. Background people must never replace a named recurring character. Identity continuity is more important than novelty.

LOCKED FILM BIBLE, REPEAT WITHOUT REINTERPRETATION:
${visualBible}
END LOCKED FILM BIBLE

VISUAL STYLE LOCK: polished theatrical 3D family animation; warm storybook feeling; expressive but natural faces; appealing rounded character design; painterly environments; rich cinematic lighting; gentle emotional acting; tasteful depth of field; coherent anatomy; fluid camera motion; 16:9 composition. Use the identical character rendering, facial proportions, materials, color grading, lens language, and animation finish in every scene. Original characters only. No logos, captions, subtitles, written text, watermarks, recognizable franchise characters, or photorealism.

SHOT INSTRUCTIONS: ${description}

Before rendering, silently check that every visible recurring character matches the LOCKED FILM BIBLE field by field. If a shot instruction conflicts with the bible, the bible wins. Preserve spatial continuity and carry the prior action naturally into this shot. Use specific blocking, facial expression, hand action, props, camera movement, depth, lighting direction, and environmental motion. Do not create a montage or an unrelated establishing image.

NARRATION — SPEAK THESE WORDS EXACTLY ONCE:
${narration}
END NARRATION

${LEGACY_SEEGEN_AUDIO_PROMPT_MARKER}. NARRATOR_1 is one and the same synthetic older off-screen storyteller across the entire film: warm medium-low register, soft dry timbre, clear relaxed diction, unhurried conversational pace, restrained emotion, gentle natural breath, steady volume, and the same accent and pronunciation in every scene. Do not create a new voice, change pitch, change vocal age, change gender presentation, change accent, change pace, or change recording distance for this shot. Speak the requested language naturally. The first audible words must be exactly the first words inside NARRATION. Never greet the audience, introduce the story, identify the speaker, announce a narrator role, or say phrases such as "I am a narrator." Begin after a brief ambience-only pause and finish the complete sentence well before the shot ends, followed by at least one second of ambience only. Never cut off, add, omit, repeat, or paraphrase words. Keep visible characters silent with no speaking lip movement. Add restrained natural ambience and no music.

FINAL CONTINUITY CHECK: same NARRATOR_1 voice, same locked characters, same wardrobe, same locations, same palette, and same props. Tell the moment visually without character dialogue or on-screen text.`;
}
