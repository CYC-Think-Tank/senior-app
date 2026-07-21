import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AudioPlayer } from "@/components/audio-player";
import { FinishSaving } from "@/components/finish-saving";
import { Card, Monogram, formatDuration } from "@/components/ui";
import { RAW_BUCKET } from "@/lib/constants";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";
import { conversationNames } from "@/lib/names";
import type { Guest, InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";
// Finishing an unfinished conversation restitches its recording server-side.
export const maxDuration = 300;

export default async function FamilyConversationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { supabase } = await requireUser();
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
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

  let audioUrl: string | null = null;
  if (s.raw_audio_path) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.storage
      .from(RAW_BUCKET)
      .createSignedUrl(s.raw_audio_path, 60 * 60 * 6);
    audioUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/family"
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
        <FinishSaving sessionId={s.id} />
      ) : (
        <Card className="p-6 text-ink-soft">{t("reviewAudioMissing")}</Card>
      )}
    </div>
  );
}
