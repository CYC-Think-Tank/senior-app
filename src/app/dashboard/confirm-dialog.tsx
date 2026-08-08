"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./senior-dashboard.module.css";

/**
 * A yes/no dialog over the whole window.
 *
 * It renders through a portal onto `document.body` rather than in place. The
 * route entrance animates `.page` with `transform`, and an ancestor transform
 * makes itself the containing block for `position: fixed` — so a backdrop left
 * inside the page would stop at the content column and leave the sidebar lit
 * and clickable behind it. Nothing above body can trap it here.
 */
export function ConfirmDialog({
  title,
  body,
  error,
  cancelLabel,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  error?: string;
  cancelLabel: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape backs out, matching the click outside. Both land on the safe side.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // Opening moves focus into the dialog, onto the choice that changes nothing.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => returnTo?.focus?.();
  }, []);

  // Safe without a mounted guard: every caller renders this only once a click
  // has set the thing being confirmed, so it never runs during the server pass.
  return createPortal(
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onMouseDown={onCancel}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <p>{body}</p>
        {error ? (
          <p role="status" aria-live="polite">
            {error}
          </p>
        ) : null}
        <div className={styles.modalActions}>
          <button
            className={`${styles.modalButton} ${styles.modalCancel}`}
            type="button"
            ref={cancelRef}
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`${styles.modalButton} ${styles.modalDelete}`}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
