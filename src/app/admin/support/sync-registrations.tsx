"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncCycRegistrations, type SyncState } from "./actions";
import styles from "./support-admin.module.css";

export function SyncRegistrations({
  label,
  pendingLabel,
  syncedLabel,
}: {
  label: string;
  pendingLabel: string;
  syncedLabel: string;
}) {
  const [state, setState] = useState<SyncState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  return (
    <div className={styles.sync}>
      {state.status === "error" ? (
        <span className={styles.syncError}>{state.message}</span>
      ) : state.status === "done" ? (
        <span className={styles.syncNote}>
          {`${syncedLabel}: +${state.result.created} · ${state.result.updated} · ${state.result.fetched}`}
        </span>
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
