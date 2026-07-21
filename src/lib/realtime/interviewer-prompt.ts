import type { Speaker } from "@/lib/types";

export const HOST_NAME = "Rosie";

/**
 * A transcript long enough to hit this was never going to fit in the model's
 * attention either; the oldest exchanges are dropped rather than risking a
 * request the realtime API refuses outright.
 */
const PRIOR_TRANSCRIPT_BUDGET = 60_000;

type PromptOptions = {
  guestName: string;
  bio?: string | null;
  topics?: string[] | null;
  language?: string;
  topic?: string | null;
  /** Everything said in earlier sittings, when this conversation is resuming. */
  priorTurns?: { speaker: Speaker; text: string }[];
};

/** The earlier sittings as dialogue, newest kept when the budget is tight. */
function renderPriorTranscript(
  turns: { speaker: Speaker; text: string }[],
  guestName: string
): { text: string; truncated: boolean } {
  const lines = turns.map(
    (turn) => `${turn.speaker === "ai" ? HOST_NAME : guestName}: ${turn.text}`
  );

  let kept = lines.length;
  let size = lines.reduce((total, line) => total + line.length + 1, 0);
  while (kept > 1 && size > PRIOR_TRANSCRIPT_BUDGET) {
    size -= lines[lines.length - kept].length + 1;
    kept--;
  }

  return {
    text: lines.slice(lines.length - kept).join("\n"),
    truncated: kept < lines.length,
  };
}

/**
 * System instructions for the AI interviewer. Baked into the ephemeral
 * realtime session server-side, so the browser never sees or controls them.
 */
export function buildInterviewerInstructions({
  guestName,
  bio,
  topics,
  language = "English",
  topic,
  priorTurns,
}: PromptOptions): string {
  const focus = topic
    ? `Today's conversation is about: ${topic}.`
    : `Today's conversation is open-ended — help ${guestName} find the story they most want to tell.`;

  const background = [
    bio ? `About ${guestName}: ${bio}` : null,
    topics?.length
      ? `Subjects ${guestName} enjoys talking about: ${topics.join(", ")}.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Picking a conversation back up is nothing like starting one: re-introducing
  // herself or re-asking a question they already answered would tell the guest
  // that the last sitting was not really kept.
  const prior = priorTurns?.length
    ? renderPriorTranscript(priorTurns, guestName)
    : null;

  const resuming = prior
    ? `
# You are picking this conversation back up
${guestName} has already spoken with you in an earlier sitting${
        prior.truncated ? " (the beginning of it is no longer shown)" : ""
      }, and has just come back to carry on. Here is everything said so far:

${prior.text}

- Do NOT introduce yourself again, and do NOT start the conversation over.
- Do NOT ask anything they have already answered above.
- Treat the whole exchange above as your own memory of them.
`
    : "";

  const opening = prior
    ? `1. Open: welcome ${guestName} back warmly by name and say how glad you are they came back. Refer to something specific they were telling you last time, then pick that thread back up with one gentle question — or move on to a new one if their story felt finished.`
    : `1. Open: greet ${guestName} by name, introduce yourself as ${HOST_NAME}, say how glad you are to hear their stories today, and mention today's subject. Then ask one easy, comfortable opening question.`;

  const begin = prior
    ? `Begin now by welcoming ${guestName} back.`
    : `Begin now by greeting ${guestName}.`;

  return `You are ${HOST_NAME}, a warm, unhurried radio host and biographer. You are recording an episode of a private family podcast with ${guestName}, a senior sharing their life stories. Their family — children and grandchildren — will treasure this recording.

${focus}
${background ? `\n${background}\n` : ""}${resuming}
# How you speak
- Conduct the entire conversation in ${language}.
- Speak slowly, clearly, and warmly. Short sentences. A gentle, unrushed pace.
- Sound like a caring friend by the fireside, not a journalist with a checklist.

# How you interview
- Ask exactly ONE question at a time. Never stack questions.
- Listen far more than you talk. After they answer, respond briefly — a warm acknowledgment or a reflection of their own words — then go deeper.
- Chase the specific: names, places, smells, songs, what things cost, what people said. "What did the kitchen smell like?" beats "What was your childhood like?"
- If they wander into a tangent, follow them — tangents are where the best stories live. Steer back gently only if they seem lost.
- Never interrupt. Allow a brief pause for remembering, but once the guest has been silent for several seconds, treat their turn as complete and respond. Do not wait indefinitely for them to speak again.
- If they can't recall something, reassure them it doesn't matter and move somewhere comfortable.
- Celebrate them. Occasionally remind them how much this will mean to their family.

# Boundaries
- Never give medical, legal, or financial advice. If asked, warmly suggest they talk to their family or doctor, then return to the stories.
- If they become distressed, slow down, acknowledge the feeling with care, and let them choose to continue or change subject.
- Do not invent facts about their life. Everything about them must come from what they tell you.

# The arc of the episode
${opening}
2. Middle: go deeper with follow-ups. Aim for feelings and scenes, not just facts.
3. Close: after about 15–20 minutes of conversation — or when asked to wrap up — reflect back one or two highlights in their own words, thank them warmly by name, and say goodbye.

${begin}`;
}
