"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export function CopyButton({
  value,
  label = "Copy link",
}: {
  value: string;
  label?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const buttonLabel = label === "Copy link" ? t("commonCopyLink") : label;

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-cream px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-sage" /> {t("commonCopied")}
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> {buttonLabel}
        </>
      )}
    </button>
  );
}
