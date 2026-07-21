"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { localeCookieName, type Locale } from "@/lib/i18n";
import styles from "@/components/language-switcher.module.css";

export function LanguageSwitcher({
  tone = "light",
}: {
  tone?: "light" | "dark" | "bare";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, setLocale } = useI18n();
  const [optimisticLocale, setOptimisticLocale] = useState<Locale | null>(null);
  const [pending, startTransition] = useTransition();
  const displayLocale = optimisticLocale ?? locale;

  function toggleLocale() {
    const nextLocale: Locale = displayLocale === "en" ? "zh-Hans" : "en";

    // Writing the non-sensitive preference locally avoids waiting for a
    // server action before the page refresh can begin.
    document.cookie = `${localeCookieName}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = nextLocale;
    setLocale(nextLocale);
    setOptimisticLocale(nextLocale);

    // Admin overview pages read their copy from the client locale context, so
    // changing language there does not need to rerun auth and database reads.
    const needsServerRefresh = !pathname.startsWith("/admin");
    if (needsServerRefresh) {
      startTransition(() => {
        router.refresh();
      });
    }
  }

  return (
    <button
      type="button"
      onClick={toggleLocale}
      disabled={pending}
      className={`${styles.control} inline-flex min-h-10 items-center justify-center rounded-lg border text-sm disabled:cursor-wait disabled:opacity-60 ${
        tone === "bare"
          ? `${styles.bare} border-transparent bg-transparent px-4 font-medium`
          : tone === "dark"
            ? "border-white/20 bg-white/10 px-3 font-semibold text-cream hover:bg-white/16"
            : "border-line bg-cream px-3 font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink"
      }`}
      aria-label={displayLocale === "en" ? "Switch to Chinese" : "Switch to English"}
    >
      <span key={displayLocale} className={styles.label}>
        {displayLocale === "en" ? "中文" : "English"}
      </span>
    </button>
  );
}
