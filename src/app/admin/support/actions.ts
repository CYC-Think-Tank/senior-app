"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { supportRequests } from "@/lib/db/schema";

const statuses = ["open", "matched", "accepted", "in_progress", "resolved", "escalated", "cancelled"] as const;
type SupportStatus = (typeof statuses)[number];

export async function updateSupportRequestStatus(requestId: string, status: SupportStatus) {
  await requireAdmin();
  if (!requestId || !statuses.includes(status)) return;

  try {
    await db
      .update(supportRequests)
      .set({ status, updated_at: new Date().toISOString() })
      .where(eq(supportRequests.id, requestId));
  } catch (error) {
    console.error("Could not update support request:", error);
  }
  revalidatePath("/admin/support");
  revalidatePath("/dashboard/support");
}
