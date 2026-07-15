import OpenAI from "openai";
import { CHAT_MODEL } from "@/lib/constants";

export type EpisodeMetadata = {
  title: string;
  description: string;
  showNotes: string;
};

const MAX_TRANSCRIPT_CHARS = 24_000;

export async function generateEpisodeMetadata({
  guestName,
  topic,
  transcript,
}: {
  guestName: string;
  topic: string | null;
  transcript: string;
}): Promise<EpisodeMetadata> {
  const fallback: EpisodeMetadata = {
    title: topic ? `${guestName} on ${topic}` : `A conversation with ${guestName}`,
    description: `${guestName} shares stories and memories in this episode.`,
    showNotes: "",
  };

  try {
    const openai = new OpenAI();
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are the producer of a private family podcast of audio memoirs. Given an interview transcript with ${guestName}, write episode metadata for their family. Respond with a JSON object:
{
  "title": "evocative, specific, at most 8 words, no quotation marks",
  "description": "2–3 warm sentences, third person, telling the family what ${guestName} shares in this episode",
  "show_notes": "markdown: 3–6 short bullets of the episode's best moments, each starting with '- ', ending with one memorable direct quote from ${guestName}"
}
Use only what is actually in the transcript. Write in the transcript's language.`,
        },
        {
          role: "user",
          content: transcript.slice(0, MAX_TRANSCRIPT_CHARS),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      title: String(parsed.title ?? fallback.title).slice(0, 200),
      description: String(parsed.description ?? fallback.description),
      showNotes: String(parsed.show_notes ?? ""),
    };
  } catch (err) {
    console.warn("Episode metadata generation failed, using fallback:", err);
    return fallback;
  }
}
