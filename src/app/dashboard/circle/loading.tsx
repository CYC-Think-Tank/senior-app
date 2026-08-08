import styles from "../senior-dashboard.module.css";

export default function CircleLoading() {
  return (
    <div className={styles.page} role="status" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <div className={styles.pageHeader} aria-hidden="true">
        <div>
          <div className="h-4 w-32 animate-pulse rounded-full bg-white/10" />
          <div className="mt-4 h-10 w-72 max-w-full animate-pulse rounded-lg bg-white/10" />
        </div>
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-white/8" aria-hidden="true" />
    </div>
  );
}
