import { NextResponse, type NextRequest } from "next/server";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptAudio, encryptAudio } from "@/lib/audio/encryption";
import { mergeKeptRanges, renderCut } from "@/lib/audio/render-cut";
import { generateEpisodeMetadata } from "@/lib/ai/episode-metadata";
import { EPISODES_BUCKET, RAW_BUCKET } from "@/lib/constants";
import { HOST_NAME } from "@/lib/realtime/interviewer-prompt";
import { decryptTurns } from "@/lib/transcript/encryption";
import type { Guest, TranscriptTurn } from "@/lib/types";

export const maxDuration = 300;

/**
 * Renders the edited episode audio from the kept transcript turns and
 * creates/updates the episode draft (with AI-written metadata on first run).
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const { sessionId, regenerateMetadata } = await request
    .json()
    .catch(() => ({}));
  if (typeof sessionId !== "string") {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: session }, { data: turns }] = await Promise.all([
    admin
      .from("sessions")
      .select("*, guests(*)")
      .eq("id", sessionId)
      .single(),
    admin
      .from("transcript_turns")
      .select("*")
      .eq("session_id", sessionId)
      .order("idx"),
  ]);

  if (!session || !session.raw_audio_path) {
    return NextResponse.json(
      { error: "Session or its recording was not found." },
      { status: 404 }
    );
  }

  const guest = session.guests as unknown as Guest;
  const kept = decryptTurns(sessionId, (turns ?? []) as TranscriptTurn[]).filter(
    (t) => !t.excluded
  );
  if (kept.length === 0) {
    return NextResponse.json(
      { error: "Every line is cut — restore at least one turn." },
      { status: 400 }
    );
  }

  const ranges = mergeKeptRanges(kept, session.duration_ms);
  const durationMs = ranges.reduce((s, r) => s + (r.endMs - r.startMs), 0);

  const { data: rawBlob, error: downloadError } = await admin.storage
    .from(RAW_BUCKET)
    .download(session.raw_audio_path);
  if (downloadError || !rawBlob) {
    return NextResponse.json(
      { error: "Could not download the raw recording." },
      { status: 500 }
    );
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "episode-"));
  try {
    const ext = session.raw_audio_path.endsWith(".m4a") ? "m4a" : "webm";
    const inputPath = path.join(workDir, `raw.${ext}`);
    const outputPath = path.join(workDir, "cut.mp3");
    await writeFile(
      inputPath,
      decryptAudio(Buffer.from(await rawBlob.arrayBuffer()))
    );

    await renderCut(inputPath, ranges, outputPath);

    const audioPath = `${guest.id}/${session.id}.mp3`;
    const { error: uploadError } = await admin.storage
      .from(EPISODES_BUCKET)
      .upload(audioPath, encryptAudio(await readFile(outputPath)), {
        contentType: "application/octet-stream",
        upsert: true,
      });
    if (uploadError) {
      console.error("Episode upload failed:", uploadError);
      return NextResponse.json(
        { error: "Could not store the rendered episode." },
        { status: 500 }
      );
    }

    const { data: existing } = await admin
      .from("episodes")
      .select("id")
      .eq("session_id", session.id)
      .maybeSingle();

    let episodeId: string;
    if (existing) {
      const updates: Record<string, unknown> = {
        audio_path: audioPath,
        duration_ms: durationMs,
      };
      if (regenerateMetadata) {
        const meta = await buildMetadata(guest, session.topic, kept);
        updates.title = meta.title;
        updates.description = meta.description;
        updates.show_notes = meta.showNotes;
      }
      await admin.from("episodes").update(updates).eq("id", existing.id);
      episodeId = existing.id;
    } else {
      const meta = await buildMetadata(guest, session.topic, kept);
      const { data: maxRow } = await admin
        .from("episodes")
        .select("episode_number")
        .eq("guest_id", guest.id)
        .order("episode_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: inserted, error: insertError } = await admin
        .from("episodes")
        .insert({
          session_id: session.id,
          guest_id: guest.id,
          episode_number: (maxRow?.episode_number ?? 0) + 1,
          title: meta.title,
          description: meta.description,
          show_notes: meta.showNotes,
          audio_path: audioPath,
          duration_ms: durationMs,
        })
        .select("id")
        .single();
      if (insertError || !inserted) {
        console.error("Episode insert failed:", insertError);
        return NextResponse.json(
          { error: "Could not create the episode." },
          { status: 500 }
        );
      }
      episodeId = inserted.id;
    }

    return NextResponse.json({ episodeId });
  } catch (err) {
    console.error("Episode render failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rendering failed." },
      { status: 500 }
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function buildMetadata(
  guest: Guest,
  topic: string | null,
  kept: TranscriptTurn[]
) {
  const transcript = kept
    .map(
      (t) => `${t.speaker === "ai" ? HOST_NAME : guest.name}: ${t.text}`
    )
    .join("\n");
  return generateEpisodeMetadata({ guestName: guest.name, topic, transcript });
}
