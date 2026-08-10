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

export const SEEGEN_AUDIO_PROMPT_MARKER = "AUDIO DIRECTION: Generate synchronized audio";

function usesCjkNarration(narration: string) {
  const compact = Array.from(narration).filter((character) => !/\s/u.test(character));
  if (!compact.length) return false;
  const cjk = compact.filter((character) =>
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character),
  );
  return cjk.length / compact.length >= 0.4;
}

/**
 * Gives every generated scene one unique portion of the narration. The chunks
 * are balanced so SeeGen can speak each one within its ten-second scene, and
 * together they contain the complete narration exactly once.
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

  const maxUnitsPerScene = cjk ? 32 : 18;
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

${SEEGEN_AUDIO_PROMPT_MARKER} with the video. A warm older storyteller speaks the voiceover in a gentle, intimate, reflective voice. Speak the following voiceover once, clearly and verbatim:

VOICEOVER FOR THIS SCENE ONLY:
${narration}
END SCENE VOICEOVER

Add only subtle natural ambience and restrained background music beneath the voice. Keep the narration easy to understand. Characters on screen must not speak.

Keep every recurring character, outfit, location, palette, and prop consistent with the continuity guide. Tell the moment visually without character dialogue or on-screen text.`;
}
