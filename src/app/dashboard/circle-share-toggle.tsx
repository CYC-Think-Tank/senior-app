"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Users } from "lucide-react";
import { setCircleSharing } from "./circle/actions";
import { useI18n } from "@/components/i18n-provider";
import styles from "./senior-dashboard.module.css";

/**
 * The whole-circle sharing switch for one conversation. A `role="switch"`
 * button rather than a checkbox: it reads as one press-to-change control to a
 * screen reader, and keeps the same 2.8rem hit target as the other row
 * actions beside it.
 *
 * `compact` is for the conversations table, where this sits fourth in a row of
 * one-word buttons and the full sentence wrapped to three lines. The label
 * shortens; the accessible name and the filled "on" state still carry which
 * way the switch is set.
 */
export function CircleShareToggle({
  sessionId,
  shared,
  className,
  compact = false,
}: {
  sessionId: string;
  shared: boolean;
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    setBusy(true);
    setError(false);
    try {
      const result = await setCircleSharing(sessionId, !shared);
      if (!result.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const label = shared ? t("shareCircleOn") : t("shareCircleLabel");

  return (
    <>
      <button
        className={`${className ?? styles.rowButton} ${shared ? styles.rowButtonOn : ""}`}
        type="button"
        role="switch"
        aria-checked={shared}
        aria-label={compact ? label : undefined}
        disabled={busy}
        onClick={toggle}
      >
        <Users aria-hidden="true" /> {compact ? t("shareCircleShort") : label}
      </button>
      {error ? <span>{t("shareCircleError")}</span> : null}
    </>
  );
}
