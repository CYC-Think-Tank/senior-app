"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { PortalShell, portalStyles } from "@/components/portal-shell";
import { Wordmark } from "@/components/ui";
import { resetPassword } from "./actions";
import styles from "../login/login.module.css";

export default function ResetPasswordPage() {
  const { locale, t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError(t("passwordResetMismatch"));
      return;
    }

    setBusy(true);
    try {
      const result = await resetPassword(password);
      if (result.ok) setSaved(true);
      else setError(result.error);
    } catch {
      setError(t("passwordResetError"));
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
              <p className={styles.eyebrow}>{locale === "en" ? "WiseShare" : "慧享"}</p>
              <LanguageSwitcher tone="bare" />
            </div>
            <h1 className={styles.heading}>{t("passwordResetTitle")}</h1>
            <p className={styles.copy}>{t("passwordResetSubtitle")}</p>

            {saved ? (
              <div className={styles.form}>
                <p className={styles.success}>{t("passwordResetSuccess")}</p>
                <p className={styles.accountPrompt}>
                  <Link href="/login">{t("passwordResetBackToLogin")}</Link>
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className={styles.form}>
                <div className={styles.field}>
                  <label htmlFor="password" className={styles.label}>
                    {t("loginPasswordLabel")}
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={styles.input}
                  />
                  <p className={styles.passwordHint}>
                    {t("signupPasswordHint")}
                  </p>
                </div>
                <div className={styles.field}>
                  <label htmlFor="confirmation" className={styles.label}>
                    {t("passwordResetConfirmLabel")}
                  </label>
                  <input
                    id="confirmation"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    className={styles.input}
                  />
                </div>
                {error && <p className={styles.error}>{error}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className={styles.submit}
                >
                  <span>
                    {busy
                      ? t("passwordResetBusy")
                      : t("passwordResetSubmit")}
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </PortalShell>
  );
}
