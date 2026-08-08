"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { generateShareLink } from "@/app/dashboard/actions";
import { useI18n } from "@/components/i18n-provider";

export function ShareConversation({
  sessionId,
  initialToken,
  origin,
  buttonClassName,
  label,
}: {
  sessionId: string;
  initialToken: string | null;
  origin: string;
  buttonClassName?: string;
  label?: string;
}) {
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(initialToken);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // The link is created lazily on the first copy, so the button reads the
  // same whether or not this conversation has been shared before.
  async function copy() {
    setBusy(true);
    setError(false);
    try {
      let shareToken = token;
      if (!shareToken) {
        const result = await generateShareLink(sessionId);
        if (!result.ok) {
          setError(true);
          return;
        }
        shareToken = result.token;
        setToken(shareToken);
      }
      await navigator.clipboard.writeText(`${origin}/share/${shareToken}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={copy}
        disabled={busy}
        className={buttonClassName ?? "inline-flex items-center gap-1.5 rounded-lg border border-line bg-cream px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink disabled:opacity-60"}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-sage" /> {t("commonCopied")}
          </>
        ) : (
          <>
            <Link2 className="h-3.5 w-3.5" /> {label ?? t("familyCopyShareLink")}
          </>
        )}
      </button>
      {error && <p className="text-xs text-ember-deep">{t("familyShareError")}</p>}
    </div>
  );
}
