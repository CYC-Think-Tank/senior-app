import Link from "next/link";
import { Mic, Plus, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { Badge, Card, Monogram, formatDuration } from "@/components/ui";
import type { Episode, Guest, InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

const episodeTone = (status: string) =>
  status === "approved" || status === "published"
    ? "sage"
    : status === "pending_approval" || status === "changes_requested"
      ? "ember"
      : "neutral";

const statusLabel: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Awaiting approval",
  changes_requested: "Changes requested",
  approved: "Approved",
  published: "Published",
  pending: "Not recorded yet",
  recording: "In progress",
  ready: "Ready to edit",
};

export default async function AdminDashboard() {
  const { supabase } = await requireAdmin();

  const [{ data: guests }, { data: sessions }, { data: episodes }] =
    await Promise.all([
      supabase.from("guests").select("*").order("created_at"),
      supabase
        .from("sessions")
        .select("*, guests(name), episodes(id)")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("episodes")
        .select("*, guests(name)")
        .order("created_at", { ascending: false }),
    ]);

  type SessionRow = InterviewSession & {
    guests: { name: string };
    episodes: { id: string } | null;
  };
  type EpisodeRow = Episode & { guests: { name: string } };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-ink-soft">
          Guests, recordings, and the episode pipeline.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
            <Users className="h-5 w-5 text-ember" /> Guests
          </h2>
          <Link
            href="/admin/guests/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-cream hover:bg-ember-deep"
          >
            <Plus className="h-4 w-4" /> New guest
          </Link>
        </div>
        {!guests?.length ? (
          <Card className="p-8 text-center text-ink-soft">
            No guests yet. Add your first storyteller to create an interview
            link.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(guests as Guest[]).map((g) => (
              <Link key={g.id} href={`/admin/guests/${g.id}`}>
                <Card className="flex items-center gap-4 p-5 transition-shadow hover:shadow-md">
                  <Monogram name={g.name} />
                  <div>
                    <p className="font-serif text-lg font-semibold">{g.name}</p>
                    <p className="text-sm text-ink-soft">
                      {g.topics?.length
                        ? g.topics.slice(0, 3).join(" · ")
                        : g.language}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-semibold">
          <Mic className="h-5 w-5 text-ember" /> Recent sessions
        </h2>
        {!sessions?.length ? (
          <Card className="p-8 text-center text-ink-soft">
            No interviews recorded yet.
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {(sessions as unknown as SessionRow[]).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="font-medium">
                    {s.guests.name}
                    {s.topic ? (
                      <span className="text-ink-soft"> — {s.topic}</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-ink-faint">
                    {new Date(s.created_at).toLocaleDateString()} ·{" "}
                    {formatDuration(s.duration_ms)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={s.status === "ready" ? "sage" : "neutral"}>
                    {statusLabel[s.status]}
                  </Badge>
                  {s.status === "ready" && (
                    <Link
                      href={`/admin/sessions/${s.id}`}
                      className="text-sm font-medium text-ember hover:text-ember-deep"
                    >
                      {s.episodes ? "Open transcript" : "Edit transcript →"}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-serif text-xl font-semibold">Episodes</h2>
        {!episodes?.length ? (
          <Card className="p-8 text-center text-ink-soft">
            No episodes yet — edit a finished session&apos;s transcript, then
            generate its episode.
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {(episodes as unknown as EpisodeRow[]).map((e) => (
              <Link
                key={e.id}
                href={`/admin/episodes/${e.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-paper-deep/40"
              >
                <div>
                  <p className="font-medium">
                    Ep. {e.episode_number} — {e.title}
                  </p>
                  <p className="text-sm text-ink-faint">
                    {e.guests.name} · {formatDuration(e.duration_ms)}
                    {e.publish_at
                      ? ` · releases ${new Date(e.publish_at).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <Badge tone={episodeTone(e.status)}>
                  {statusLabel[e.status]}
                </Badge>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
