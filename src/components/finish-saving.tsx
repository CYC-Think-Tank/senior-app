"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishSavingConversation } from "@/app/family/actions";
import { Card } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";

/**
 * Offered on a conversation that ended before it was wrapped up. Assembling
 * the recording takes a moment, so it is a deliberate click rather than
 * something that happens invisibly while the page loads.
 */
export function FinishSaving({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run() {
    setBusy(true);
    setFailed(false);
    try {
      const result = await finishSavingConversation(sessionId);
      if (result.ok) router.refresh();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <p className="text-ink-soft">{t("familyUnfinishedNote")}</p>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-lg bg-ember px-4 py-2 font-medium text-cream transition-colors hover:bg-ember-deep disabled:opacity-60"
      >
        {busy ? t("familyFinishSavingBusy") : t("familyFinishSaving")}
      </button>
      {failed && (
        <p className="text-sm text-ember-deep">{t("familyFinishSavingError")}</p>
      )}
    </Card>
  );
}
