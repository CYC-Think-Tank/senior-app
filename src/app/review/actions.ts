"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// These actions are token-gated rather than auth-gated: the unguessable
// review_token (delivered privately to the guest) is the credential.

export async function approveEpisode(reviewToken: string) {
  const admin = createSupabaseAdminClient();
  const { data: episode, error } = await admin
    .from("episodes")
    .update({
      status: "approved",
      change_note: null,
      publish_at: new Date().toISOString(),
    })
    .eq("review_token", reviewToken)
    .neq("status", "published")
    .select("id")
    .single();
  if (error || !episode) throw new Error("Could not save the approval.");

  revalidatePath("/feed");
  revalidatePath(`/feed/${episode.id}`);
}

export async function requestChanges(reviewToken: string, note: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("episodes")
    .update({
      status: "changes_requested",
      change_note: note.trim().slice(0, 2000) || null,
    })
    .eq("review_token", reviewToken)
    .neq("status", "published");
  if (error) throw new Error("Could not save the request.");
}
