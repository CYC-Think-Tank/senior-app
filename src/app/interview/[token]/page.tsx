import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { guests, profiles, sessions, transcriptTurns } from "@/lib/db/schema";
import { resolveCurrentGuestName } from "@/lib/guest-name";
import { decryptTurns } from "@/lib/transcript/encryption";
import type { InterviewResume } from "@/lib/realtime/interview-client";
import { I18nProvider } from "@/components/i18n-provider";
import { localeForInterviewLanguage } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import InterviewRoom from "./interview-room";

// Token-gated page: the unguessable URL is the credential, so the senior
// never has to log in. Every read happens server-side.
export default async function InterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [session] = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      topic: sessions.topic,
      duration_ms: sessions.duration_ms,
      share_token: sessions.share_token,
      recording_consent_at: sessions.recording_consent_at,
      guest_name: guests.name,
      guest_user_id: guests.user_id,
      guest_language: guests.language,
    })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guest_id))
    .where(eq(sessions.token, token))
    .limit(1);

  if (!session) notFound();

  const guest = {
    name: session.guest_name,
    user_id: session.guest_user_id,
    language: session.guest_language,
  };
  const guestName = await resolveCurrentGuestName(guest);

  // Only used to point the "home" link somewhere sensible — a signed-out
  // storyteller arriving on their link is the ordinary case here.
  const user = await getSessionUser();
  let homeHref: "/" | "/admin" | "/dashboard" = "/";

  if (user) {
    const [profile] = await db
      .select({ role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    homeHref = profile?.role === "admin" ? "/admin" : "/dashboard";
  }

  // A conversation that ended before it was wrapped up is waiting to be picked
  // back up, not started over: the live checkpoints kept its transcript, and
  // the new recording will be appended to the audio they saved.
  let resume: InterviewResume | undefined;
  if (session.status !== "ready") {
    const saved = await db
      .select({
        idx: transcriptTurns.idx,
        speaker: transcriptTurns.speaker,
        text: transcriptTurns.text,
        start_ms: transcriptTurns.start_ms,
        end_ms: transcriptTurns.end_ms,
      })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.session_id, session.id))
      .orderBy(asc(transcriptTurns.idx));

    if (saved.length) {
      const turns = decryptTurns(session.id, saved).map((turn) => ({
        speaker: turn.speaker,
        text: turn.text,
        startMs: turn.start_ms,
        endMs: turn.end_ms,
      }));
      resume = {
        turns,
        // The last checkpoint's duration, unless the turns themselves reach
        // further — a transcript can outlive the heartbeat that follows it.
        offsetMs: Math.max(
          session.duration_ms ?? 0,
          ...turns.map((turn) => turn.endMs)
        ),
      };
    }
  }

  const interviewLocale = guest.user_id
    ? await getPreferredLocale()
    : localeForInterviewLanguage(guest.language);

  return (
    <I18nProvider key={interviewLocale} locale={interviewLocale}>
      <InterviewRoom
        token={token}
        guestName={guestName}
        topic={session.topic}
        initialShareToken={session.share_token}
        alreadyRecorded={session.status === "ready"}
        isLoggedIn={Boolean(user)}
        homeHref={homeHref}
        resume={resume}
        recordingConsentRequired={!session.recording_consent_at}
      />
    </I18nProvider>
  );
}
