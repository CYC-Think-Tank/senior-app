import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AudioPlayer } from "@/components/audio-player";
import { Card, Monogram, formatDuration } from "@/components/ui";
import { RAW_BUCKET } from "@/lib/constants";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";
import type { Guest, InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FamilyConversationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { supabase } = await requireUser();
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  // Read through the user's client so RLS keeps this inside the family; the
  // service role is only used afterwards to sign the audio URL.
  const { data: session } = await supabase
    .from("sessions")
    .select("*, guests(name)")
    .eq("id", sessionId)
    .eq("status", "ready")
    .single();
  if (!session) notFound();

  const s = session as unknown as InterviewSession & {
    guests: Pick<Guest, "name">;
  };

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
          <p className="text-sm font-medium uppercase tracking-wide text-ember">
            {s.guests.name} · {t("familyConversationLabel")}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold sm:text-4xl">
            {s.topic || t("familyConversationLabel")}
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
      ) : (
        <Card className="p-6 text-ink-soft">{t("reviewAudioMissing")}</Card>
      )}
    </div>
  );
}
