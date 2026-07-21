import Link from "next/link";
import { notFound } from "next/navigation";
import { Mic, Trash2, UserPlus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import {
  createSession,
  deleteSession,
  inviteFamily,
} from "@/app/admin/actions";
import { CopyButton } from "@/components/copy-button";
import {
  Badge,
  Card,
  Monogram,
  buttonStyles,
  formatDuration,
  inputStyles,
} from "@/components/ui";
import type { Episode, Guest, InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GuestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const [{ data: guest }, { data: sessions }, { data: episodes }] =
    await Promise.all([
      supabase.from("guests").select("*").eq("id", id).single(),
      supabase
        .from("sessions")
        .select("*")
        .eq("guest_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("episodes")
        .select("*")
        .eq("guest_id", id)
        .order("episode_number", { ascending: false }),
    ]);

  if (!guest) notFound();
  const g = guest as Guest;

  // Everyone sharing this guest's family_id can hear their episodes.
  const { data: family } = g.family_id
    ? await supabase
        .from("profiles")
        .select("id, email")
        .eq("family_id", g.family_id)
        .order("created_at")
    : { data: null };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-5">
        <Monogram name={g.name} size="lg" />
        <div>
          <h1 className="font-serif text-3xl font-semibold">{g.name}</h1>
          <p className="mt-1 text-ink-soft">
            Speaks {g.language}
            {g.topics?.length ? ` · loves talking about ${g.topics.join(", ")}` : ""}
          </p>
          {g.bio && <p className="mt-1 max-w-2xl text-sm text-ink-faint">{g.bio}</p>}
        </div>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-semibold">
          <Mic className="h-5 w-5 text-ember" /> Interview sessions
        </h2>
        <Card className="p-5">
          <form
            action={createSession.bind(null, g.id)}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-64 flex-1">
              <label className="mb-1.5 block text-sm font-medium text-ink-soft">
                Topic for the next conversation
              </label>
              <input
                name="topic"
                placeholder="e.g. Growing up in the village"
                className={inputStyles}
              />
            </div>
            <button type="submit" className={buttonStyles.primary}>
              Create interview link
            </button>
          </form>
        </Card>

        {(sessions as InterviewSession[] | null)?.length ? (
          <Card className="mt-4 divide-y divide-line">
            {(sessions as InterviewSession[]).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="font-medium">
                    {s.topic ?? "Open conversation"}
                  </p>
                  <p className="text-sm text-ink-faint">
                    {new Date(s.created_at).toLocaleDateString()} ·{" "}
                    {formatDuration(s.duration_ms)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={s.status === "ready" ? "sage" : "neutral"}>
                    {s.status === "ready"
                      ? "Recorded"
                      : s.status === "recording"
                        ? "In progress"
                        : "Waiting"}
                  </Badge>
                  {s.status !== "ready" && (
                    <CopyButton
                      value={`${site}/interview/${s.token}`}
                      label="Copy interview link"
                    />
                  )}
                  {s.status === "ready" ? (
                    <Link
                      href={`/admin/sessions/${s.id}`}
                      className="text-sm font-medium text-ember hover:text-ember-deep"
                    >
                      Edit transcript →
                    </Link>
                  ) : (
                    <Link
                      href={`/interview/${s.token}`}
                      target="_blank"
                      className="text-sm font-medium text-ink-soft hover:text-ink"
                    >
                      Open
                    </Link>
                  )}
                  <form action={deleteSession.bind(null, s.id, g.id)}>
                    <button
                      className="rounded-lg p-1.5 text-ink-faint hover:bg-paper-deep hover:text-ember-deep"
                      title="Delete session"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </Card>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 font-serif text-xl font-semibold">Episodes</h2>
        {(episodes as Episode[] | null)?.length ? (
          <Card className="divide-y divide-line">
            {(episodes as Episode[]).map((e) => (
              <Link
                key={e.id}
                href={`/admin/episodes/${e.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-paper-deep/40"
              >
                <p className="font-medium">
                  Ep. {e.episode_number} — {e.title}
                </p>
                <Badge
                  tone={
                    e.status === "approved" || e.status === "published"
                      ? "sage"
                      : e.status === "draft"
                        ? "neutral"
                        : "ember"
                  }
                >
                  {e.status.replace("_", " ")}
                </Badge>
              </Link>
            ))}
          </Card>
        ) : (
          <Card className="p-6 text-center text-sm text-ink-soft">
            No episodes yet.
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-semibold">
          <UserPlus className="h-5 w-5 text-ember" /> Family listeners
        </h2>
        <Card className="p-5">
          <form
            action={inviteFamily.bind(null, g.id)}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-64 flex-1">
              <label className="mb-1.5 block text-sm font-medium text-ink-soft">
                Invite by email
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="daughter@example.com"
                className={inputStyles}
              />
            </div>
            <button type="submit" className={buttonStyles.secondary}>
              Send invite
            </button>
          </form>
          {family?.length ? (
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {family.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{f.email}</span>
                  <Badge tone="sage">Has access</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
