import { notFound } from "next/navigation";
import { resolveCurrentGuestName } from "@/lib/guest-name";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InterviewResume } from "@/lib/realtime/interview-client";
import InterviewRoom from "./interview-room";

// Token-gated page: the unguessable URL is the credential, so the senior
// never has to log in. Data access happens server-side via the admin client.
export default async function InterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: session } = await admin
    .from("sessions")
    .select(
      "id, status, topic, duration_ms, share_token, guests(name, user_id)"
    )
    .eq("token", token)
    .single();

  if (!session) notFound();

  const guest = session.guests as unknown as {
    name: string;
    user_id: string | null;
  };
  const guestName = await resolveCurrentGuestName(admin, guest);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A conversation that ended before it was wrapped up is waiting to be picked
  // back up, not started over: the live checkpoints kept its transcript, and
  // the new recording will be appended to the audio they saved.
  let resume: InterviewResume | undefined;
  if (session.status !== "ready") {
    const { data: saved } = await admin
      .from("transcript_turns")
      .select("speaker, text, start_ms, end_ms")
      .eq("session_id", session.id)
      .order("idx", { ascending: true });

    if (saved?.length) {
      const turns = saved.map((turn) => ({
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

  return (
    <InterviewRoom
      token={token}
      guestName={guestName}
      topic={session.topic}
      initialShareToken={session.share_token}
      alreadyRecorded={session.status === "ready"}
      isLoggedIn={Boolean(user)}
      resume={resume}
    />
  );
}
