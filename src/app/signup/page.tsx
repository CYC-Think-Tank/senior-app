"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import {
  PortalShell,
  portalStyles,
} from "@/components/portal-shell";
import { Wordmark } from "@/components/ui";
import { signUpWithPassword } from "./actions";
import styles from "../login/login.module.css";

export default function SignupPage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await signUpWithPassword(name, email, password);
      if (result.ok) {
        router.replace(result.redirectTo);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError(t("signupError"));
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
            <h1 className={styles.heading}>{t("signupTitle")}</h1>
            <p className={styles.copy}>{t("signupSubtitle")}</p>

            <form onSubmit={signUp} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="name" className={styles.label}>
                  {t("signupNameLabel")}
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  autoComplete="name"
                  maxLength={80}
                  placeholder={t("signupNamePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={styles.input}
                />
              </div>
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
                  placeholder={t("loginPasswordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={styles.input}
                />
                <p className={styles.passwordHint}>{t("signupPasswordHint")}</p>
              </div>
              {error && <p className={styles.error}>{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className={styles.submit}
              >
                <span>{busy ? t("signupBusy") : t("signupTitle")}</span>
                <ArrowRight aria-hidden="true" />
              </button>
              <p className={styles.note}>{t("signupDevNote")}</p>
              <p className={styles.accountPrompt}>
                {t("signupHasAccount")}{" "}
                <Link href="/login">{t("signupLoginLink")}</Link>
              </p>
            </form>
          </div>
        </div>
      </main>
    </PortalShell>
  );
}
