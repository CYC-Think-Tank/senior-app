import { PassThrough, Readable } from "node:stream";
import { ZipArchive, type ArchiverError } from "archiver";
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  audioExtension,
  conversationArchiveFolder,
  conversationDetails,
  conversationTranscript,
  type ExportableConversation,
} from "@/lib/conversation-export";
import { RAW_BUCKET } from "@/lib/constants";
import { translate } from "@/lib/i18n";
import { conversationNames } from "@/lib/names";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Guest,
  InterviewSession,
  TranscriptTurn,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const SESSION_PAGE_SIZE = 500;
const TURN_PAGE_SIZE = 1000;
const TURN_SESSION_BATCH_SIZE = 50;

type OwnSession = Pick<
  InterviewSession,
  | "id"
  | "title"
  | "topic"
  | "status"
  | "created_at"
  | "started_at"
  | "duration_ms"
  | "raw_audio_path"
> & {
  guests: Pick<Guest, "name" | "user_id">;
};

type ExportTurn = Pick<
  TranscriptTurn,
  "session_id" | "idx" | "speaker" | "text" | "start_ms" | "end_ms" | "excluded"
>;

async function getOwnSessions() {
  const { supabase, user } = await requireUser();
  const sessions: OwnSession[] = [];

  for (let from = 0; ; from += SESSION_PAGE_SIZE) {
    // This read uses the signed-in user's RLS-scoped client and also filters by
    // the storyteller's user id, so family members cannot export one another.
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, title, topic, status, created_at, started_at, duration_ms, raw_audio_path, guests!inner(name, user_id)",
      )
      .in("status", ["ready", "recording"])
      .eq("guests.user_id", user.id)
      .order("created_at", { ascending: true })
      .range(from, from + SESSION_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as unknown as OwnSession[];
    sessions.push(...page);
    if (page.length < SESSION_PAGE_SIZE) break;
  }

  return sessions;
}

async function getTurnsForAuthorizedSessions(sessionIds: string[]) {
  const admin = createSupabaseAdminClient();
  const turns: ExportTurn[] = [];

  // transcript_turns is not family-readable through RLS. Only after the
  // sessions above have been authorized do we use the service role to fetch
  // their matching transcript rows.
  for (
    let batchStart = 0;
    batchStart < sessionIds.length;
    batchStart += TURN_SESSION_BATCH_SIZE
  ) {
    const batch = sessionIds.slice(
      batchStart,
      batchStart + TURN_SESSION_BATCH_SIZE,
    );

    for (let from = 0; ; from += TURN_PAGE_SIZE) {
      const { data, error } = await admin
        .from("transcript_turns")
        .select("session_id, idx, speaker, text, start_ms, end_ms, excluded")
        .in("session_id", batch)
        .order("session_id", { ascending: true })
        .order("idx", { ascending: true })
        .range(from, from + TURN_PAGE_SIZE - 1);

      if (error) throw error;

      const page = (data ?? []) as ExportTurn[];
      turns.push(...page);
      if (page.length < TURN_PAGE_SIZE) break;
    }
  }

  return turns;
}

function readme(locale: string, conversationCount: number) {
  const singular = conversationCount === 1;
  if (locale === "zh-Hant") {
    return singular
      ? "這個 WiseShare 匯出檔包含您選擇的對話，包括原始錄音（如有）、逐字稿和對話資料。\n"
      : "這個 WiseShare 匯出檔包含您的所有對話。每個資料夾內有原始錄音（如有）、逐字稿和對話資料。\n";
  }
  if (locale === "zh-Hans") {
    return singular
      ? "这个 WiseShare 导出文件包含您选择的对话，包括原始录音（如有）、文字记录和对话信息。\n"
      : "这个 WiseShare 导出文件包含您的所有对话。每个文件夹内有原始录音（如有）、文字记录和对话信息。\n";
  }
  return singular
    ? "This WiseShare export contains your selected conversation, including the original recording (when available), a transcript, and conversation details.\n"
    : "This WiseShare export contains all of your conversations. Each folder includes the original recording (when available), a transcript, and conversation details.\n";
}

async function fillArchive(
  archive: ZipArchive,
  conversations: ExportableConversation[],
  locale: string,
  signedUrls: Map<string, string>,
) {
  archive.append(readme(locale, conversations.length), { name: "README.txt" });

  for (const conversation of conversations) {
    const folder = conversationArchiveFolder(conversation);
    archive.append(conversationTranscript(conversation, locale), {
      name: `${folder}/transcript.txt`,
    });
    archive.append(conversationDetails(conversation), {
      name: `${folder}/details.json`,
    });

    if (!conversation.raw_audio_path) {
      archive.append("No completed audio recording is available.\n", {
        name: `${folder}/audio-unavailable.txt`,
      });
      continue;
    }

    const signedUrl = signedUrls.get(conversation.raw_audio_path);
    if (!signedUrl) {
      archive.append("The audio recording could not be included.\n", {
        name: `${folder}/audio-unavailable.txt`,
      });
      continue;
    }

    try {
      const response = await fetch(signedUrl);
      if (!response.ok || !response.body) {
        throw new Error(`Storage returned ${response.status}.`);
      }
      archive.append(
        Readable.fromWeb(
          response.body as import("node:stream/web").ReadableStream,
        ),
        {
          name: `${folder}/recording${audioExtension(
            conversation.raw_audio_path,
          )}`,
        },
      );
    } catch (error) {
      console.error(
        `Could not add audio for conversation ${conversation.id}:`,
        error,
      );
      archive.append("The audio recording could not be included.\n", {
        name: `${folder}/audio-unavailable.txt`,
      });
    }
  }

  await archive.finalize();
}

export async function GET(request: NextRequest) {
  const conversationId =
    request.nextUrl.searchParams.get("conversationId")?.trim() || undefined;
  // Resolve request-bound authentication and locale before creating the stream.
  const [allSessions, locale] = await Promise.all([
    getOwnSessions(),
    getPreferredLocale(),
  ]);
  const sessions = conversationId
    ? allSessions.filter((session) => session.id === conversationId)
    : allSessions;
  if (!sessions.length) {
    return new Response(
      conversationId
        ? "That conversation is not available to export."
        : "No conversations are available to export.",
      {
        status: 404,
      },
    );
  }

  const turns = await getTurnsForAuthorizedSessions(
    sessions.map((session) => session.id),
  );
  const turnsBySession = new Map<string, ExportTurn[]>();
  for (const turn of turns) {
    const existing = turnsBySession.get(turn.session_id) ?? [];
    existing.push(turn);
    turnsBySession.set(turn.session_id, existing);
  }

  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);
  // Number names against the complete list so an individual export keeps the
  // same "Conversation N" label shown in the dashboard.
  const names = conversationNames(allSessions, (number) =>
    t("familyConversationNumbered", { number }),
  );
  const conversations: ExportableConversation[] = sessions.map((session) => ({
    ...session,
    name: names.get(session.id) ?? t("familyConversationLabel"),
    guestName: session.guests.name,
    turns: turnsBySession.get(session.id) ?? [],
  }));

  const audioPaths = conversations.flatMap((conversation) =>
    conversation.raw_audio_path ? [conversation.raw_audio_path] : [],
  );
  const signedUrls = new Map<string, string>();
  if (audioPaths.length) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(RAW_BUCKET)
      .createSignedUrls(audioPaths, 15 * 60);
    if (error) {
      console.error("Could not sign conversation audio for export:", error);
    }
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        signedUrls.set(item.path, item.signedUrl);
      }
    }
  }

  const output = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 1 } });
  archive.on("warning", (error: ArchiverError) => {
    if (error.code === "ENOENT") {
      console.warn("Conversation export warning:", error);
      return;
    }
    output.destroy(error);
  });
  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);

  void fillArchive(archive, conversations, locale, signedUrls).catch(
    (error) => {
      console.error("Could not build conversation export:", error);
      archive.abort();
      output.destroy(error instanceof Error ? error : new Error(String(error)));
    },
  );

  const date = new Date().toISOString().slice(0, 10);
  const filename = conversationId
    ? `wiseshare-conversation-${conversationId.slice(0, 8)}-${date}.zip`
    : `wiseshare-conversations-${date}.zip`;
  return new Response(
    Readable.toWeb(output) as ReadableStream<Uint8Array>,
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/zip",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
