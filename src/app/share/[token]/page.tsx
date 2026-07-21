import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AudioPlayer } from "@/components/audio-player";
import { Card, Monogram, Wordmark, formatDuration } from "@/components/ui";
import { RAW_BUCKET } from "@/lib/constants";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";
import type { Guest, InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

// Token-gated public share page — no login required. The unguessable
// share_token is the credential; only "ready" conversations are shareable.
export default async function SharedConversationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("*, guests(name)")
    .eq("share_token", token)
    .eq("status", "ready")
    .single();
  if (!session) notFound();

  const s = session as unknown as InterviewSession & {
    guests: Pick<Guest, "name">;
  };

  let audioUrl: string | null = null;
  if (s.raw_audio_path) {
    const { data } = await admin.storage
      .from(RAW_BUCKET)
      .createSignedUrl(s.raw_audio_path, 60 * 60 * 6);
    audioUrl = data?.signedUrl ?? null;
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-8">
        <div className="text-center">
          <Wordmark />
        </div>

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
    </main>
  );
}
