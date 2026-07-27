export const GUEST_FINISH_TOOL_NAME =
  "finish_interview_after_guest_consent";

export const GUEST_FINISH_REASONS = [
  "explicit_farewell",
  "explicit_stop_request",
  "confirmed_ready_to_finish",
] as const;

export type GuestFinishReason = (typeof GUEST_FINISH_REASONS)[number];

export const GUEST_FINISH_TOOL = {
  type: "function",
  name: GUEST_FINISH_TOOL_NAME,
  description:
    "Finish the current interview only after the guest unmistakably authorizes ending it in their current turn: they directly say farewell to Rosie, directly ask to stop, or clearly confirm they are ready to finish after Rosie asks. Never call this because time has passed, the conversation feels complete, the guest is quiet, or a story contains a quoted, remembered, hypothetical, or discussed farewell. When uncertain, keep the interview going.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: {
        type: "string",
        enum: GUEST_FINISH_REASONS,
        description: "The guest-controlled reason the interview may end.",
      },
    },
    required: ["reason"],
  },
} as const;

export type GuestFinishToolCall = {
  callId: string;
  reason: GuestFinishReason | null;
};

export type InterviewClosingStyle = "warm_summary" | "brief_goodbye";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFinishReason(value: unknown): GuestFinishReason | null {
  if (typeof value !== "string") return null;

  try {
    const args = JSON.parse(value) as unknown;
    if (
      isRecord(args) &&
      typeof args.reason === "string" &&
      GUEST_FINISH_REASONS.some((reason) => reason === args.reason)
    ) {
      return args.reason as GuestFinishReason;
    }
  } catch {
    // The caller handles malformed arguments as a rejected finish request.
  }

  return null;
}

/**
 * Finds Rosie's guest-authorized finish request in a completed Realtime
 * response. Invalid arguments are returned with a null reason so the client
 * can acknowledge the tool call and keep the interview moving.
 */
export function findGuestFinishToolCall(
  response: unknown
): GuestFinishToolCall | null {
  if (!isRecord(response) || !Array.isArray(response.output)) return null;

  for (const output of response.output) {
    if (
      !isRecord(output) ||
      output.type !== "function_call" ||
      output.name !== GUEST_FINISH_TOOL_NAME ||
      typeof output.call_id !== "string" ||
      !output.call_id
    ) {
      continue;
    }

    return {
      callId: output.call_id,
      reason: parseFinishReason(output.arguments),
    };
  }

  return null;
}

export function getInterviewClosingInstructions(
  style: InterviewClosingStyle
): string {
  if (style === "brief_goodbye") {
    return "The guest has clearly chosen to end the conversation. In the interview's language, say one warm, natural goodbye of no more than two short sentences. Do not summarize, ask a question, introduce a topic, or invite them to continue. Then stop speaking.";
  }

  return "The guest pressed the finish button, so the conversation is ending now. Deliver a warm closing in the interview's language: reflect back one or two highlights from today in the guest's own words, thank them by name, and say goodbye. Do not ask another question. Keep it under 45 seconds.";
}
