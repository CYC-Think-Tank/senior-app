"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { signInWithEmail } from "@/app/login/actions";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Wordmark, inputStyles } from "@/components/ui";
import {
  PortalShell,
  portalStyles,
} from "@/components/portal-shell";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithEmail(email);
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
            <Wordmark tone="light" />
          </div>
          <div className={portalStyles.headerTools}>
            <LanguageSwitcher tone="bare" />
          </div>
        </div>
      </header>
      <main className={portalStyles.loginMain}>
        <div className={portalStyles.loginWrap}>
          <div className={portalStyles.loginPanel}>
            <h1 className={portalStyles.loginHeading}>{t("commonSignIn")}</h1>
            <p className={portalStyles.loginCopy}>{t("loginSubtitle")}</p>

            <form onSubmit={signIn} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-ink-soft"
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
                  className={inputStyles}
                />
              </div>
              {error && <p className="text-sm text-ember-deep">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className={`${portalStyles.primaryButton} w-full`}
              >
                <LogIn className="h-4 w-4" />
                {busy ? t("loginBusy") : t("commonSignIn")}
              </button>
              <p className="text-center text-sm text-ink-faint">
                {t("loginDevNote")}
              </p>
            </form>

          </div>
        </div>
      </main>
    </PortalShell>
  );
}
