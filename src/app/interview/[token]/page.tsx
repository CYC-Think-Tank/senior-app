import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
    .select("status, topic, guests(name)")
    .eq("token", token)
    .single();

  if (!session) notFound();

  const guest = session.guests as unknown as { name: string };

  return (
    <InterviewRoom
      token={token}
      guestName={guest.name}
      topic={session.topic}
      alreadyRecorded={session.status === "ready"}
    />
  );
}
