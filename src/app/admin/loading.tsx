import styles from "./admin-dashboard.module.css";

export default function AdminLoading() {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <div>
        <div className={`${styles.loadingLine} ${styles.loadingEyebrow}`} />
        <div className={`${styles.loadingLine} ${styles.loadingTitle}`} />
        <div className={`${styles.loadingLine} ${styles.loadingIntro}`} />
      </div>
      <div className={styles.loadingGrid}>
        <div className={styles.loadingCard} />
        <div className={styles.loadingCard} />
        <div className={styles.loadingCard} />
      </div>
      <div className={`${styles.loadingCard} ${styles.loadingPanel}`} />
    </div>
  );
}
