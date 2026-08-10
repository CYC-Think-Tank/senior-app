import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mic } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { resumeConversation } from "@/app/family/actions";
import { createAudioUrl } from "@/lib/audio/encryption";
import { AudioPlayer } from "@/components/audio-player";
import { Card, Monogram, formatDuration } from "@/components/ui";
import { RAW_BUCKET } from "@/lib/constants";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { conversationNames } from "@/lib/names";
import type { Guest, InterviewSession } from "@/lib/types";
import type { ConversationVideo } from "@/lib/types";
import { publicConversationVideo } from "@/lib/memoir/workflow";
import { MemoirVideoCard } from "./memoir-video-card";

export const dynamic = "force-dynamic";

export default async function FamilyConversationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { supabase } = await requireUser();
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);

  // Read through the user's client so RLS keeps this inside the family; the
  // service role is only used afterwards to sign the audio URL. The siblings
  // come along so an unnamed conversation gets the same number as the list.
  const { data: sessions } = await supabase
    .from("sessions")
    .select("*, guests(name)")
    .in("status", ["ready", "recording"]);

  type SessionRow = InterviewSession & { guests: Pick<Guest, "name"> };
  const all = (sessions ?? []) as unknown as SessionRow[];
  const s = all.find((row) => row.id === sessionId);
  if (!s) notFound();

  const name =
    conversationNames(all, (number) =>
      t("familyConversationNumbered", { number })
    ).get(s.id) ?? "";

  const audioUrl = s.raw_audio_path
    ? createAudioUrl(RAW_BUCKET, s.raw_audio_path, 60 * 60 * 6)
    : null;

  const { data: videoRow } = s.status === "ready"
    ? await supabase
        .from("conversation_videos")
        .select("*")
        .eq("session_id", s.id)
        .maybeSingle()
    : { data: null };
  const initialVideo = videoRow
    ? await publicConversationVideo(videoRow as ConversationVideo)
    : null;

  return (
    <div className="space-y-6">
      <Link
        href="/family/conversations"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> {t("familyAllConversations")}
      </Link>

      <div className="flex items-center gap-5">
        <Monogram name={s.guests.name} size="lg" />
        <div>
          <h1 className="font-serif text-3xl font-semibold sm:text-4xl">
            {name}
          </h1>
          <p className="mt-1 text-sm text-ink-faint">
            {new Date(s.created_at).toLocaleDateString(locale, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · {formatDuration(s.duration_ms)}
          </p>
        </div>
      </div>

      {audioUrl ? (
        <AudioPlayer src={audioUrl} durationMs={s.duration_ms} />
      ) : s.status === "recording" ? (
        <Card className="space-y-4 p-6">
          <p className="text-ink-soft">{t("familyUnfinishedNote")}</p>
          <form action={resumeConversation.bind(null, s.id)}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-ember px-4 py-2 font-medium text-cream transition-colors hover:bg-ember-deep"
            >
              <Mic className="h-4 w-4" /> {t("familyContinue")}
            </button>
          </form>
        </Card>
      ) : (
        <Card className="p-6 text-ink-soft">{t("reviewAudioMissing")}</Card>
      )}

      {s.status === "ready" ? (
        <MemoirVideoCard sessionId={s.id} initialVideo={initialVideo} />
      ) : null}
    </div>
  );
}
