"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { PortalShell, portalStyles } from "@/components/portal-shell";
import { Wordmark } from "@/components/ui";
import { requestPasswordReset } from "./actions";
import styles from "../login/login.module.css";

export default function ForgotPasswordPage() {
  const { locale, t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await requestPasswordReset(email);
      if (result.ok) setSent(true);
      else setError(result.error);
    } catch {
      setError(t("passwordResetRequestError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell>
      <header className={portalStyles.header}>
        <div
          className={`${portalStyles.headerInner} ${portalStyles.headerInnerNarrow}`}
        >
          <span className={portalStyles.navSpacer} aria-hidden="true" />
          <div className={portalStyles.headerBrand}>
            <Wordmark tone="light" locale={locale} />
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.wrap}>
          <div className={styles.panel}>
            <div className={styles.panelTop}>
              <p className={styles.eyebrow}>{locale === "en" ? "WiseShare" : "仁慧享"}</p>
              <LanguageSwitcher tone="bare" />
            </div>
            <h1 className={styles.heading}>{t("passwordResetRequestTitle")}</h1>
            <p className={styles.copy}>{t("passwordResetRequestSubtitle")}</p>

            <form onSubmit={submit} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="email" className={styles.label}>
                  {t("loginEmailLabel")}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={t("loginEmailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.input}
                />
              </div>
              {error && <p className={styles.error}>{error}</p>}
              {sent && (
                <p className={styles.success}>
                  {t("passwordResetRequestSuccess")}
                </p>
              )}
              {!sent && (
                <button
                  type="submit"
                  disabled={busy}
                  className={styles.submit}
                >
                  <span>
                    {busy
                      ? t("passwordResetRequestBusy")
                      : t("passwordResetRequestSubmit")}
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              )}
              <p className={styles.accountPrompt}>
                <Link href="/login">{t("passwordResetBackToLogin")}</Link>
              </p>
            </form>
          </div>
        </div>
      </main>
    </PortalShell>
  );
}
