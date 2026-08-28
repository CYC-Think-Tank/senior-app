import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { resolveCurrentGuestName } from "@/lib/guest-name";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { guests, profiles, sessions, transcriptTurns } from "@/lib/db/schema";
import { decryptTurns } from "@/lib/transcript/encryption";
import type { InterviewResume } from "@/lib/realtime/interview-client";
import { I18nProvider } from "@/components/i18n-provider";
import { localeForInterviewLanguage } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import InterviewRoom from "./interview-room";

// Token-gated page: the unguessable URL is the credential, so the senior
// never has to log in. Data access happens server-side via the admin client.
export default async function InterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // The unguessable token in the URL is the credential, so this looks the
  // conversation up by it and nothing else.
  const [row] = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      topic: sessions.topic,
      durationMs: sessions.durationMs,
      shareToken: sessions.shareToken,
      recordingConsentAt: sessions.recordingConsentAt,
      guestName: guests.name,
      guestUserId: guests.userId,
      guestLanguage: guests.language,
    })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guestId))
    .where(eq(sessions.token, token))
    .limit(1);

  if (!row) notFound();

  const guestName = await resolveCurrentGuestName({
    name: row.guestName,
    userId: row.guestUserId,
  });

  // Only decides where the "home" link points; the token above is what grants
  // access to the conversation itself, signed in or not.
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
  if (row.status !== "ready") {
    const saved = await db
      .select({
        idx: transcriptTurns.idx,
        speaker: transcriptTurns.speaker,
        text: transcriptTurns.text,
        startMs: transcriptTurns.startMs,
        endMs: transcriptTurns.endMs,
      })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.sessionId, row.id))
      .orderBy(asc(transcriptTurns.idx));

    if (saved.length) {
      const turns = decryptTurns(row.id, saved).map((turn) => ({
        speaker: turn.speaker as "ai" | "guest",
        text: turn.text,
        startMs: turn.startMs,
        endMs: turn.endMs,
      }));
      resume = {
        turns,
        // The last checkpoint's duration, unless the turns themselves reach
        // further — a transcript can outlive the heartbeat that follows it.
        offsetMs: Math.max(
          row.durationMs ?? 0,
          ...turns.map((turn) => turn.endMs)
        ),
      };
    }
  }

  const interviewLocale = row.guestUserId
    ? await getPreferredLocale()
    : localeForInterviewLanguage(row.guestLanguage);

  return (
    <I18nProvider key={interviewLocale} locale={interviewLocale}>
      <InterviewRoom
        token={token}
        guestName={guestName}
        topic={row.topic}
        initialShareToken={row.shareToken}
        alreadyRecorded={row.status === "ready"}
        isLoggedIn={Boolean(user)}
        homeHref={homeHref}
        resume={resume}
        recordingConsentRequired={!row.recordingConsentAt}
      />
    </I18nProvider>
  );
}
