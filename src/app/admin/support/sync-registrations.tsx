"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncCycRegistrations, type SyncState } from "./actions";
import styles from "./support-admin.module.css";

export function SyncRegistrations({
  label,
  pendingLabel,
  summary,
}: {
  label: string;
  pendingLabel: string;
  summary: (result: { created: number; updated: number; fetched: number }) => string;
}) {
  const [state, setState] = useState<SyncState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  return (
    <div className={styles.sync}>
      {state.status === "error" ? (
        <span className={styles.syncError}>{state.message}</span>
      ) : state.status === "done" ? (
        <span className={styles.syncNote}>{summary(state.result)}</span>
      ) : null}
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => setState(await syncCycRegistrations()))
        }
      >
        <RefreshCw aria-hidden="true" />
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}
