"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic, Pencil } from "lucide-react";
import { renameConversation, resumeConversation } from "@/app/family/actions";
import { ShareConversation } from "@/components/share-conversation";
import { Card, Monogram, inputStyles } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";

export function ConversationRow({
  sessionId,
  guestName,
  name,
  title,
  meta,
  shareToken,
  origin,
  unfinished = false,
}: {
  sessionId: string;
  guestName: string;
  /** Display name — the title, or a generated "Conversation N". */
  name: string;
  /** The stored title, so editing an unnamed conversation starts empty. */
  title: string | null;
  meta: string;
  shareToken: string | null;
  origin: string;
  /** Ended before it was wrapped up; recovered from its checkpoints. */
  unfinished?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const result = await renameConversation(sessionId, value);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card className="flex flex-wrap items-center gap-5 p-6">
        <Monogram name={guestName} />
        <form onSubmit={save} className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            autoFocus
            value={value}
            maxLength={120}
            placeholder={t("familyRenamePlaceholder")}
            onChange={(e) => setValue(e.target.value)}
            className={inputStyles}
          />
          {error && (
            <p className="text-sm text-ember-deep">{t("familyRenameError")}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-cream hover:bg-ember-deep disabled:opacity-60"
            >
              {t("familySave")}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setValue(title ?? "");
                setError(false);
              }}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink"
            >
              {t("familyCancel")}
            </button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="flex flex-wrap items-center gap-5 p-6 transition-shadow hover:shadow-md">
      <Link
        href={`/family/${sessionId}`}
        className="flex min-w-0 flex-1 items-center gap-5"
      >
        <Monogram name={guestName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-serif text-2xl font-semibold">
              {name}
            </h2>
            {unfinished && (
              <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                {t("familyUnfinished")}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-ink-faint">{meta}</p>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        {/* A conversation that ended early can simply be carried on. */}
        {unfinished && (
          <form action={resumeConversation.bind(null, sessionId)}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-ember-deep"
            >
              <Mic className="h-3.5 w-3.5" /> {t("familyContinue")}
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-cream px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5" /> {t("familyRename")}
        </button>
        {/* Nothing to share until the recording has been assembled. */}
        {!unfinished && (
          <ShareConversation
            sessionId={sessionId}
            initialToken={shareToken}
            origin={origin}
          />
        )}
      </div>
    </Card>
  );
}
