"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  syncCycSeniorCareRegistrations,
  type CycRegistrationSyncResult,
} from "@/lib/support/cyc-sync";
import { WixCmsError } from "@/lib/wix-cms";

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

export type SyncState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; result: CycRegistrationSyncResult };

/**
 * Pulls Senior Care sign-ups from the thecyc.org CMS on demand. The same sync
 * also runs nightly from /api/cron/sync-cyc-registrations.
 */
export async function syncCycRegistrations(): Promise<SyncState> {
  await requireAdmin();

  try {
    const result = await syncCycSeniorCareRegistrations(
      createSupabaseAdminClient(),
    );
    revalidatePath("/admin/support");
    return { status: "done", result };
  } catch (error) {
    console.error("Could not sync CYC registrations:", error);
    return {
      status: "error",
      message:
        error instanceof WixCmsError
          ? error.message
          : "The CYC registrations could not be read.",
    };
  }
}

/**
 * Verifying a support worker is what makes them matchable — imported
 * registrants stay inactive until an admin vouches for them here.
 */
export async function setProviderApproval(providerId: string, approved: boolean) {
  await requireAdmin();
  if (!providerId) return;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("support_providers")
    .update({ verified: approved, active: approved })
    .eq("id", providerId);
  if (error) console.error("Could not update support provider:", error);
  revalidatePath("/admin/support");
}
