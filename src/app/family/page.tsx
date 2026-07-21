import { cookies, headers } from "next/headers";
import { Mic } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { startMyConversation } from "@/app/family/actions";
import { Card, formatDuration } from "@/components/ui";
import { ConversationRow } from "@/components/conversation-row";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";
import { conversationNames } from "@/lib/names";
import type { InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const { supabase } = await requireUser();
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);

  // Absolute origin for building shareable links, derived from the request.
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  const proto =
    h.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  // RLS limits this to finished conversations of the family's storyteller(s).
  const { data: sessions } = await supabase
    .from("sessions")
    .select("*, guests(name)")
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  type SessionRow = InterviewSession & { guests: { name: string } };
  const rows = (sessions ?? []) as unknown as SessionRow[];
  const names = conversationNames(rows, (number) =>
    t("familyConversationNumbered", { number })
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-semibold">
            {t("familyTitle")}
          </h1>
          <p className="mt-2 text-lg text-ink-soft">{t("familyIntro")}</p>
        </div>
        <form action={startMyConversation}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-ember px-4 py-2 text-sm font-medium text-cream hover:bg-ember-deep"
          >
            <Mic className="h-4 w-4" /> {t("familyStartConversation")}
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="font-serif text-2xl text-ink-soft">
            {t("familyNoConversations")}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((s) => (
            <ConversationRow
              key={s.id}
              sessionId={s.id}
              guestName={s.guests.name}
              name={names.get(s.id) ?? ""}
              title={s.title}
              meta={`${new Date(s.created_at).toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })} · ${formatDuration(s.duration_ms)}`}
              shareToken={s.share_token}
              origin={origin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
