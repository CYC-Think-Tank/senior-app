"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { supportRequests } from "@/lib/db/schema";
import { assessSupportRequest } from "@/lib/support/ai";
import {
  saveSupportRequest,
  serviceModes as modes,
  supportPreferences as preferences,
} from "@/lib/support/requests";
import type {
  ProviderMatch,
  ServiceMode,
  SupportAssessment,
  SupportPreference,
} from "@/lib/support/matching";

export type SupportRequestState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      requestId: string;
      assessment: SupportAssessment;
      match: ProviderMatch | null;
    };

const clean = (value: FormDataEntryValue | null, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function createSupportRequest(
  _previous: SupportRequestState,
  formData: FormData,
): Promise<SupportRequestState> {
  const { user } = await requireUser();
  const request = clean(formData.get("request"), 2000);
  const language = clean(formData.get("language"), 80) || "English";
  const location = clean(formData.get("location"), 160);
  const availability = clean(formData.get("availability"), 240);
  const rawPreference = clean(formData.get("preference"), 40) as SupportPreference;
  const rawMode = clean(formData.get("mode"), 20) as ServiceMode;
  const preference = preferences.includes(rawPreference) ? rawPreference : "no_preference";
  const mode = modes.includes(rawMode) ? rawMode : "either";

  if (request.length < 3) {
    return { status: "error", message: "Please tell WiseShare what you need help with." };
  }
  if (!availability) {
    return { status: "error", message: "Please share a day or time that works for you." };
  }

  const assessment = await assessSupportRequest({
    request,
    language,
    preference,
    location,
    availability,
  });

  const saved = await saveSupportRequest({
    requesterId: user.id,
    requestText: request,
    assessment,
    preference,
    mode,
    location,
    availability,
  });

  if (!saved) {
    return { status: "error", message: "We could not save your request. Please try again." };
  }

  revalidatePath("/dashboard/support");
  revalidatePath("/admin/support");
  return {
    status: "success",
    requestId: saved.id,
    assessment,
    match: saved.match,
  };
}

export async function submitSupportFollowUp(requestId: string, resolved: boolean) {
  const { user } = await requireUser();
  if (!requestId) return;

  try {
    // Server Actions are public POST endpoints. Pinning the update to the
    // signed-in requester's id is what stops one senior answering another
    // person's follow-up: a request id that is not theirs matches no rows.
    await db
      .update(supportRequests)
      .set({
        status: resolved ? "resolved" : "escalated",
        feedback: resolved ? "resolved_by_senior" : "senior_still_needs_help",
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(supportRequests.id, requestId),
          eq(supportRequests.requesterId, user.id),
        ),
      );
  } catch (error) {
    console.error("Could not save support follow-up:", error);
  }
  revalidatePath("/dashboard/support");
  revalidatePath("/admin/support");
}
