import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.home} href="/">← Fireside</Link>
        <p className={styles.eyebrow}>Legal</p>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.updated}>Effective July 27, 2026</p>

        <article className={styles.content}>
          <section>
            <h2>What this covers</h2>
            <p>
              Fireside helps people record conversations and turn them into audio memoirs. This policy explains how we handle personal information when you use Fireside.
            </p>
          </section>
          <section>
            <h2>Information we collect</h2>
            <p>We collect the information needed to provide the service, which may include:</p>
            <ul>
              <li>account information, such as your name and email address;</li>
              <li>profile details and interview preferences you choose to provide;</li>
              <li>audio recordings, transcripts, and episode details created through Fireside; and</li>
              <li>technical information needed to operate and secure the service, including authentication and session data.</li>
            </ul>
          </section>
          <section>
            <h2>How we use information</h2>
            <p>
              We use information to provide interviews and accounts, create recordings and episodes, protect the service, respond to requests, and send account or invitation emails. We do not sell personal information.
            </p>
          </section>
          <section>
            <h2>Recording, AI, and publication</h2>
            <p>
              Before an interview begins, the storyteller is asked to consent to recording and AI processing. Fireside uses OpenAI to run the AI interviewer and help create episode metadata. Raw conversations remain private unless you deliberately share a private link. A finished episode is made public only after the storyteller separately approves it.
            </p>
          </section>
          <section>
            <h2>Service providers</h2>
            <p>
              We use service providers to operate Fireside, including Supabase for authentication, databases, and file storage; OpenAI for AI interview features; and Resend for invitation and account emails. They process information only as needed to provide their services to us.
            </p>
          </section>
          <section>
            <h2>Retention and security</h2>
            <p>
              We keep information for as long as it is needed to provide Fireside, meet legal obligations, resolve disputes, and enforce agreements. Unfinished public interviews are normally deleted after about 24 hours. We use reasonable safeguards appropriate to the sensitivity of the information, but no online service can guarantee absolute security.
            </p>
          </section>
          <section>
            <h2>Your choices</h2>
            <p>
              You can ask to access, correct, or delete personal information, or withdraw consent for future processing where applicable. To make a request, contact the Fireside organization that invited you using the contact details in your invitation. Withdrawing consent does not affect processing already completed or information we must retain by law.
            </p>
          </section>
          <section>
            <h2>Changes to this policy</h2>
            <p>
              We may update this policy as Fireside changes. We will post the updated version here and revise the effective date.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
