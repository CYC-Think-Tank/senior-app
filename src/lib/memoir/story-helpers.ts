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
/** Paid storyboards created before master narration shipped remain reusable. */
export const LEGACY_SEEGEN_AUDIO_PROMPT_MARKER = "AUDIO DIRECTION: Generate synchronized audio";

function usesCjkNarration(narration: string) {
  const compact = Array.from(narration).filter((character) => !/\s/u.test(character));
  if (!compact.length) return false;
  const cjk = compact.filter((character) =>
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character),
  );
  return cjk.length / compact.length >= 0.4;
}

/**
 * Gives every generated scene one complete portion of the narration. These
 * become independently timed TTS sentences on one final master audio track;
 * Seedance never receives or cuts the spoken audio.
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

  const maxUnitsPerScene = cjk ? 46 : 24;
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

VISUAL STYLE: polished theatrical 3D family animation; warm storybook feeling; expressive but natural faces; appealing rounded character design; painterly environments; rich cinematic lighting; gentle emotional acting; tasteful depth of field; coherent anatomy; fluid camera motion; 16:9 composition. Original characters only. No logos, captions, subtitles, written text, watermarks, recognizable franchise characters, or photorealism.

CONTINUITY: ${visualBible}

SHOT: ${description}

NARRATION CONTEXT FOR VISUAL TIMING ONLY:
${narration}
END NARRATION CONTEXT

${SEEGEN_SILENT_PROMPT_MARKER}. Do not generate speech, music, ambience, or sound effects. Do not show the narration as text. Characters must not speak or move their lips as though speaking. A separately generated master narration will be synchronized during editing.

Keep every recurring character, outfit, location, palette, and prop consistent with the continuity guide. Tell the moment visually without character dialogue or on-screen text.`;
}
