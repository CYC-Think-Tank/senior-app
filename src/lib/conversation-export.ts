/**
 * What the export writer needs from a conversation.
 *
 * Written out rather than picked from the row types: the archive is a file
 * format other people keep, so it should not silently change shape when a
 * column does.
 */
type ExportableSession = {
  id: string;
  title: string | null;
  topic: string | null;
  status: string;
  createdAt: string;
  startedAt: string | null;
  durationMs: number | null;
  rawAudioPath: string | null;
};

export type ExportableConversation = ExportableSession & {
  name: string;
  guestName: string;
  turns: {
    idx: number;
    speaker: string;
    text: string;
    startMs: number;
    endMs: number;
    excluded: boolean;
  }[];
};

/** Keeps user-chosen titles safe inside a ZIP path on every major OS. */
export function safeArchiveSegment(value: string, fallback: string) {
  const cleaned = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/g, "")
    .replace(/[ .]+$/g, "")
    .trim();
  const usable = cleaned.replace(/[-_. ]/g, "");
  return (usable ? cleaned : fallback).slice(0, 100);
}

export function conversationArchiveFolder(
  conversation: Pick<ExportableConversation, "id" | "name" | "createdAt">,
) {
  const date = conversation.createdAt.slice(0, 10);
  const name = safeArchiveSegment(conversation.name, "Conversation");
  return `${date} - ${name} - ${conversation.id.slice(0, 8)}`;
}

export function audioExtension(path: string) {
  const match = path.toLowerCase().match(/(\.[a-z0-9]{1,8})$/);
  return match?.[1] ?? ".webm";
}

function timestamp(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function conversationTranscript(
  conversation: ExportableConversation,
  locale: string,
) {
  const turns = [...conversation.turns].sort((a, b) => a.idx - b.idx);
  const recorded = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(conversation.startedAt ?? conversation.createdAt));
  const lines = [
    conversation.name,
    recorded,
    "",
    ...turns.flatMap((turn) => [
      `[${timestamp(turn.startMs)}] ${
        turn.speaker === "ai" ? "Rosie" : conversation.guestName
      }${turn.excluded ? " [excluded from episode]" : ""}`,
      turn.text,
      "",
    ]),
  ];

  return `${lines.join("\n").trimEnd()}\n`;
}

export function conversationDetails(conversation: ExportableConversation) {
  return JSON.stringify(
    {
      id: conversation.id,
      name: conversation.name,
      topic: conversation.topic,
      status: conversation.status,
      createdAt: conversation.createdAt,
      startedAt: conversation.startedAt,
      durationMs: conversation.durationMs,
      hasAudio: Boolean(conversation.rawAudioPath),
      transcriptTurnCount: conversation.turns.length,
    },
    null,
    2,
  );
}
