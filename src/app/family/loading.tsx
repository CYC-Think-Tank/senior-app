import styles from "./senior-dashboard.module.css";

export default function FamilyLoading() {
  return (
    <div className={styles.page} role="status" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <div className={styles.startCard} aria-hidden="true">
        <div>
          <div className="h-8 w-64 animate-pulse rounded-lg bg-white/10" />
          <div className="mt-4 h-4 w-96 max-w-full animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="h-16 w-56 animate-pulse rounded-xl bg-white/12" />
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-white/8" aria-hidden="true" />
    </div>
  );
}
