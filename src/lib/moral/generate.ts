import type { SupabaseClient } from "@supabase/supabase-js";
import { MORAL_MODEL } from "@/lib/constants";
import { locales } from "@/lib/i18n";
import { decryptTurns } from "@/lib/transcript/encryption";
import { decryptMoral, encryptMoral, type Moral } from "./encryption";

/**
 * A conversation shorter than this said too little to have a point. Better no
 * takeaway at all than a confident platitude invented out of small talk.
 *
 * Deliberately low — a couple of real sentences, not a minimum story length.
 * Someone who answered briefly but meant it still gets a moral; only "すごい"
 * and an abandoned hello are turned away.
 */
const MIN_GUEST_CHARS = 120;

/**
 * How much transcript the model is shown. An hour of talk fits comfortably;
 * past the cap the middle is dropped rather than the tail, because the reason
 * a story mattered is usually said at the end of telling it.
 */
const MAX_TRANSCRIPT_CHARS = 40_000;

const INSTRUCTIONS = `You read transcripts of older adults telling their life stories to Rosie, an AI interviewer, and distil the one thing a young person should carry away from them.

Write a single sentence:
- Ground it in what this person actually said. Name the specific thing they lived through or chose; never reach for a proverb that would fit any life.
- At most 18 words in English. Plain, warm, direct.
- Do not preach, do not open with "always" or "remember", do not use quotation marks or exclamation marks.
- Speak to someone young without talking down to them.
- Write it in the third person about the storyteller's life or as a plain statement of what holds true. Do not address the storyteller.

Return that same moral written naturally in each language — idiomatic in all three, not translated word for word:
- en: English
- zh-Hans: Simplified Chinese
- zh-Hant: Traditional Chinese`;

type TurnRow = { idx: number; speaker: string; text: string; excluded: boolean };

/** The conversation as the model sees it, trimmed from the middle if long. */
function renderTranscript(turns: TurnRow[], guestName: string): string {
  const body = turns
    .map(
      (turn) =>
        `${turn.speaker === "ai" ? "Rosie" : guestName}: ${turn.text.trim()}`
    )
    .join("\n\n");
  if (body.length <= MAX_TRANSCRIPT_CHARS) return body;

  const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
  return `${body.slice(0, half)}\n\n[...]\n\n${body.slice(-half)}`;
}

/**
 * Asks the model for the takeaway. Returns null on anything unexpected — a
 * refusal, a timeout, a shape that is not three filled-in locales — so the
 * caller can simply not render a moral.
 */
async function requestMoral(
  transcript: string,
  guestName: string,
  topic: string | null
): Promise<Moral | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("moral generation skipped: OPENAI_API_KEY is not set");
    return null;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MORAL_MODEL,
      messages: [
        { role: "system", content: INSTRUCTIONS },
        {
          role: "user",
          content: [
            `Storyteller: ${guestName}`,
            topic?.trim() ? `Topic: ${topic.trim()}` : null,
            "",
            "Transcript:",
            transcript,
          ]
            .filter((line) => line !== null)
            .join("\n"),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "moral",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: Object.fromEntries(
              locales.map((locale) => [locale, { type: "string" }])
            ),
            required: [...locales],
          },
        },
      },
    }),
  }).catch((error: unknown) => {
    console.error("moral request failed:", error);
    return null;
  });

  if (!res) return null;
  if (!res.ok) {
    console.error("moral request failed:", res.status, await res.text());
    return null;
  }

  const content = (await res.json())?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("moral response was not JSON");
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const usable = locales.every(
    (locale) =>
      typeof record?.[locale] === "string" &&
      (record[locale] as string).trim().length > 0
  );
  if (!usable) return null;

  return Object.fromEntries(
    locales.map((locale) => [locale, (record[locale] as string).trim()])
  ) as Moral;
}

/**
 * The conversation's takeaway, generating and storing it the first time it is
 * asked for. Doing this lazily rather than at finalize means conversations
 * recorded before this shipped get one too, and only the conversations someone
 * actually opens a share link for ever cost a model call.
 *
 * Every failure path returns null and leaves the column alone: a share page
 * whose moral could not be written still plays the recording, which is the
 * thing the link was sent for.
 */
export async function ensureMoral(
  admin: SupabaseClient,
  session: { id: string; moral: string | null; topic: string | null },
  guestName: string
): Promise<Moral | null> {
  const stored = decryptMoral(session.id, session.moral);
  if (stored) return stored;

  // Admin-excluded turns are cut from the story the family publishes, so they
  // are not part of what it means either.
  const { data: rows, error } = await admin
    .from("transcript_turns")
    .select("idx, speaker, text, excluded")
    .eq("session_id", session.id)
    .eq("excluded", false)
    .order("idx", { ascending: true });
  if (error || !rows?.length) {
    console.warn(`no moral for session ${session.id}: transcript is empty`);
    return null;
  }

  let turns: TurnRow[];
  try {
    turns = decryptTurns(session.id, rows as TurnRow[]);
  } catch (cause) {
    console.error(`transcript for session ${session.id} is unreadable:`, cause);
    return null;
  }

  const said = turns
    .filter((turn) => turn.speaker === "guest")
    .reduce((total, turn) => total + turn.text.trim().length, 0);
  if (said < MIN_GUEST_CHARS) {
    console.warn(
      `no moral for session ${session.id}: the storyteller said ${said} characters, under the ${MIN_GUEST_CHARS} needed`
    );
    return null;
  }

  const moral = await requestMoral(
    renderTranscript(turns, guestName),
    guestName,
    session.topic
  );
  if (!moral) return null;

  const { error: saveError } = await admin
    .from("sessions")
    .update({ moral: encryptMoral(session.id, moral) })
    .eq("id", session.id);
  if (saveError) {
    // Worth showing now even if the next visitor has to pay for it again.
    console.error("moral could not be saved:", saveError);
  }

  return moral;
}
