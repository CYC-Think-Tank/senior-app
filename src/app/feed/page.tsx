import Link from "next/link";
import { cookies } from "next/headers";
import { Play } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Card, Monogram, formatDuration } from "@/components/ui";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";
import type { Episode } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);

  // Public feed: only released (approved/published, past publish_at) episodes,
  // across every storyteller. Served via the service role so no login is needed.
  const admin = createSupabaseAdminClient();
  const { data: episodes } = await admin
    .from("episodes")
    .select("*, guests(name)")
    .in("status", ["approved", "published"])
    .lte("publish_at", new Date().toISOString())
    .order("publish_at", { ascending: false });

  type EpisodeRow = Episode & { guests: { name: string } };
  const rows = (episodes ?? []) as unknown as EpisodeRow[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-4xl font-semibold">
          {t("feedTitle")}
        </h1>
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="font-serif text-2xl text-ink-soft">
            {t("feedNoEpisodes")}
          </p>
          <p className="mt-2 text-ink-faint">{t("feedWait")}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((e) => (
            <Link key={e.id} href={`/feed/${e.id}`} className="block">
              <Card className="flex items-center gap-5 p-6 transition-shadow hover:shadow-md">
                <Monogram name={e.guests.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium uppercase tracking-wide text-ember">
                    {e.guests.name} · {t("commonEpisode")} {e.episode_number}
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
                      ? new Date(e.publish_at).toLocaleDateString(locale, {
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
