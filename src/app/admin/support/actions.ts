"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const statuses = ["open", "matched", "accepted", "in_progress", "resolved", "escalated", "cancelled"] as const;
type SupportStatus = (typeof statuses)[number];

export async function updateSupportRequestStatus(requestId: string, status: SupportStatus) {
  await requireAdmin();
  if (!requestId || !statuses.includes(status)) return;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("support_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) console.error("Could not update support request:", error);
  revalidatePath("/admin/support");
  revalidatePath("/dashboard/support");
}
