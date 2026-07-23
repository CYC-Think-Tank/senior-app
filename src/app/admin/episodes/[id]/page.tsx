import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  markApproved,
  sendForApproval,
  updateEpisodeMeta,
} from "@/app/admin/actions";
import { CopyButton } from "@/components/copy-button";
import {
  Badge,
  Card,
  buttonStyles,
  formatDuration,
  inputStyles,
} from "@/components/ui";
import { EPISODES_BUCKET } from "@/lib/constants";
import type { Episode, Guest } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusCopy: Record<string, { label: string; tone: "neutral" | "ember" | "sage" }> = {
  draft: { label: "Draft — not yet sent to the guest", tone: "neutral" },
  pending_approval: { label: "Waiting for the guest's approval", tone: "ember" },
  changes_requested: { label: "The guest asked for changes", tone: "ember" },
  approved: { label: "Approved by the guest", tone: "sage" },
  published: { label: "Published", tone: "sage" },
};

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: episode } = await supabase
    .from("episodes")
    .select("*, guests(*)")
    .eq("id", id)
    .single();
  if (!episode) notFound();

  const e = episode as unknown as Episode & { guests: Guest };
  const admin = createSupabaseAdminClient();
  const { data: signed } = await admin.storage
    .from(EPISODES_BUCKET)
    .createSignedUrl(e.audio_path, 60 * 60 * 2);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const status = statusCopy[e.status] ?? statusCopy.draft;
  const isLive = e.status === "approved" || e.status === "published";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">
            <Link
              href={`/admin/guests/${e.guest_id}`}
              className="hover:text-ink"
            >
              {e.guests.name}
            </Link>{" "}
            · Episode {e.episode_number} ·{" "}
            <Link
              href={`/admin/sessions/${e.session_id}`}
              className="text-ember hover:text-ember-deep"
            >
              edit transcript
            </Link>
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold">{e.title}</h1>
        </div>
        <Badge tone={status.tone}>{isLive ? "Live in feed" : status.label}</Badge>
      </div>

      {e.status === "changes_requested" && e.change_note && (
        <Card className="border-ember/40 bg-ember-soft/50 p-4 text-sm text-ember-deep">
          <strong>Requested change:</strong> {e.change_note}
        </Card>
      )}

      <Card className="p-4">
        {signed?.signedUrl ? (
          <audio controls src={signed.signedUrl} className="w-full" />
        ) : (
          <p className="text-sm text-ink-soft">Audio unavailable.</p>
        )}
        <p className="mt-2 text-sm text-ink-faint">
          Edited cut · {formatDuration(e.duration_ms)}
        </p>
      </Card>

      <Card className="p-6">
        <form action={updateEpisodeMeta.bind(null, e.id)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              Title
            </label>
            <input
              name="title"
              defaultValue={e.title}
              required
              className={inputStyles}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              Description
            </label>
            <textarea
              name="description"
              rows={3}
              defaultValue={e.description ?? ""}
              className={inputStyles}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              Show notes (markdown bullets)
            </label>
            <textarea
              name="show_notes"
              rows={6}
              defaultValue={e.show_notes ?? ""}
              className={inputStyles}
            />
          </div>
          <button type="submit" className={buttonStyles.secondary}>
            Save changes
          </button>
        </form>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-serif text-xl font-semibold">Guest approval</h2>
        <p className="text-sm text-ink-soft">
          Send {e.guests.name} the review link — they can listen and approve
          the episode for the public Episodes page with one big button, no
          sign-in needed.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <form action={sendForApproval.bind(null, e.id)}>
            <button
              className={buttonStyles.primary}
              disabled={e.status === "approved" || e.status === "published"}
            >
              <Send className="h-4 w-4" /> Mark as sent for approval
            </button>
          </form>
          <CopyButton
            value={`${site}/review/${e.review_token}`}
            label="Copy review link"
          />
          {e.status !== "approved" && e.status !== "published" && (
            <form action={markApproved.bind(null, e.id)}>
              <button
                className={buttonStyles.ghost}
                title="Skip guest approval (for testing)"
              >
                <CheckCircle2 className="h-4 w-4" /> Approve manually
              </button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
