import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = {
  title: "Terms of Use",
};

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.home} href="/">← Fireside</Link>
        <p className={styles.eyebrow}>Legal</p>
        <h1 className={styles.title}>Terms of Use</h1>
        <p className={styles.updated}>Effective July 27, 2026</p>

        <article className={styles.content}>
          <section>
            <h2>Using Fireside</h2>
            <p>
              Fireside is a service for recording and sharing personal stories. Use it lawfully and only with the permission of everyone whose voice or personal information is included in a recording.
            </p>
          </section>
          <section>
            <h2>Your content and permissions</h2>
            <p>
              You are responsible for the information and recordings you provide. Do not upload or record material that infringes another person’s rights, is unlawful, or contains another person’s private information without their permission.
            </p>
          </section>
          <section>
            <h2>Publication choices</h2>
            <p>
              A recording is not public by default. The storyteller can review a finished episode and choose whether it is approved for the public Fireside episodes page. Private share links should be sent only to people you trust.
            </p>
          </section>
          <section>
            <h2>Accounts and availability</h2>
            <p>
              Keep your account credentials secure and tell us promptly if you believe someone has accessed your account without permission. Fireside may change, suspend, or discontinue features when necessary to operate, secure, or improve the service.
            </p>
          </section>
          <section>
            <h2>Contact and changes</h2>
            <p>
              Questions about these terms can be directed to the Fireside organization that invited you. We may update these terms from time to time by posting the updated version on this page.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
