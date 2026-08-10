"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function deleteUser(userId: string) {
  const { user } = await requireAdmin();
  if (userId === user.id) throw new Error("You cannot delete your own account.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error("Could not delete that user.");
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function setTurnExcluded(
  turnId: string,
  sessionId: string,
  excluded: boolean
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("transcript_turns")
    .update({ excluded })
    .eq("id", turnId)
    .eq("session_id", sessionId);
  if (error) throw new Error("Could not update the turn.");
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath(`/dashboard/${sessionId}`);
  revalidatePath(`/dashboard/circle/${sessionId}`);
}
