"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithPassword } from "@/app/login/actions";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Wordmark } from "@/components/ui";
import {
  PortalShell,
  portalStyles,
} from "@/components/portal-shell";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithPassword(email, password);
      if (result.ok) {
        router.replace(result.redirectTo);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError(t("loginError"));
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
            <h1 className={styles.heading}>{t("commonSignIn")}</h1>
            <p className={styles.copy}>{t("loginSubtitle")}</p>

            <form onSubmit={signIn} className={styles.form}>
              <div className={styles.field}>
                <label
                  htmlFor="email"
                  className={styles.label}
                >
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
              <div className={styles.field}>
                <label htmlFor="password" className={styles.label}>
                  {t("loginPasswordLabel")}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder={t("loginPasswordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={styles.input}
                />
                <Link className={styles.fieldLink} href="/forgot-password">
                  {t("loginForgotPassword")}
                </Link>
              </div>
              {error && <p className={styles.error}>{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className={styles.submit}
              >
                <span>{busy ? t("loginBusy") : t("commonSignIn")}</span>
                <ArrowRight aria-hidden="true" />
              </button>
              <p className={styles.note}>
                {t("loginDevNote")}
              </p>
              <p className={styles.accountPrompt}>
                {t("loginNoAccount")}{" "}
                <Link href="/signup">{t("loginSignUpLink")}</Link>
              </p>
            </form>
          </div>
        </div>
      </main>
    </PortalShell>
  );
}
