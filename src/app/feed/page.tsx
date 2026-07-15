import Link from "next/link";
import { Play } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Card, Monogram, formatDuration } from "@/components/ui";
import type { Episode, Guest } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const { supabase } = await requireUser();

  const [{ data: guests }, { data: episodes }] = await Promise.all([
    supabase.from("guests").select("*").order("name"),
    supabase
      .from("episodes")
      .select("*, guests(name)")
      .in("status", ["approved", "published"])
      .lte("publish_at", new Date().toISOString())
      .order("publish_at", { ascending: false }),
  ]);

  type EpisodeRow = Episode & { guests: { name: string } };
  const rows = (episodes ?? []) as unknown as EpisodeRow[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-4xl font-semibold">Family stories</h1>
        <p className="mt-2 text-lg text-ink-soft">
          {guests?.length
            ? `New episodes with ${(guests as Guest[])
                .map((g) => g.name)
                .join(", ")} appear here as they're released.`
            : "When you're invited to a storyteller's episodes, they'll appear here."}
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="font-serif text-2xl text-ink-soft">
            No episodes released yet.
          </p>
          <p className="mt-2 text-ink-faint">
            The first story is worth the wait.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((e) => (
            <Link key={e.id} href={`/feed/${e.id}`} className="block">
              <Card className="flex items-center gap-5 p-6 transition-shadow hover:shadow-md">
                <Monogram name={e.guests.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium uppercase tracking-wide text-ember">
                    {e.guests.name} · Episode {e.episode_number}
                  </p>
                  <h2 className="mt-0.5 truncate font-serif text-2xl font-semibold">
                    {e.title}
                  </h2>
                  {e.description && (
                    <p className="mt-1 line-clamp-2 text-ink-soft">
                      {e.description}
                    </p>
                  )}
                  <p className="mt-1.5 text-sm text-ink-faint">
                    {e.publish_at
                      ? new Date(e.publish_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : ""}{" "}
                    · {formatDuration(e.duration_ms)}
                  </p>
                </div>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ember text-cream">
                  <Play className="ml-0.5 h-6 w-6" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
