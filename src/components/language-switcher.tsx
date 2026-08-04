"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { setLocaleAction } from "@/app/language/actions";
import {
  localeCookieName,
  localeLabels,
  locales,
  type Locale,
} from "@/lib/i18n";
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
  const [preparing, setPreparing] = useState(false);
  const [pending, startTransition] = useTransition();
  const swapTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const displayLocale = optimisticLocale ?? locale;

  useEffect(
    () => () => {
      if (swapTimerRef.current !== null) {
        window.clearTimeout(swapTimerRef.current);
      }
      if (safetyTimerRef.current !== null) {
        window.clearTimeout(safetyTimerRef.current);
      }
      document.documentElement.removeAttribute("data-language-transition");
    },
    [],
  );

  function selectLocale(nextLocale: Locale) {
    if (preparing || pending) return;
    if (nextLocale === displayLocale) return;

    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }

    const needsServerRefresh = !pathname.startsWith("/admin");
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const applyLocale = () => {
      swapTimerRef.current = null;

      // Writing the non-sensitive preference locally avoids waiting for a
      // server action before the page refresh can begin.
      document.cookie = `${localeCookieName}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
      document.documentElement.lang = nextLocale;
      setLocale(nextLocale);
      setOptimisticLocale(nextLocale);
      setPreparing(false);

      // Signed-in users also keep this choice in their profile so their next
      // device starts in the same language. Anonymous visitors still retain
      // the cookie-only behaviour above.
      void setLocaleAction(nextLocale);

      // Admin overview pages read their copy from the client locale context,
      // so changing language there does not need to rerun auth and data reads.
      if (needsServerRefresh) {
        startTransition(() => {
          router.refresh();
        });

        // The provider clears the transition as soon as refreshed server copy
        // arrives. This fallback prevents a failed refresh leaving text faded.
        safetyTimerRef.current = window.setTimeout(() => {
          document.documentElement.removeAttribute(
            "data-language-transition",
          );
        }, 1600);
      } else {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            document.documentElement.removeAttribute(
              "data-language-transition",
            );
          });
        });
      }
    };

    if (reduceMotion) {
      applyLocale();
      return;
    }

    setPreparing(true);
    document.documentElement.setAttribute(
      "data-language-transition",
      "out",
    );
    swapTimerRef.current = window.setTimeout(applyLocale, 180);
  }

  return (
    <span className={styles.wrapper}>
      <select
        value={displayLocale}
        onChange={(event) => selectLocale(event.target.value as Locale)}
        disabled={preparing || pending}
        aria-busy={preparing || pending}
        aria-label="Language"
        className={`${styles.control} inline-flex min-h-10 cursor-pointer appearance-none items-center justify-center rounded-lg border text-sm disabled:cursor-wait disabled:opacity-60 ${
          tone === "bare"
            ? `${styles.bare} border-transparent bg-transparent py-0 pl-4 pr-10 font-medium`
            : tone === "dark"
              ? "border-white/20 bg-white/10 py-0 pl-3 pr-9 font-semibold text-cream hover:bg-white/16"
              : "border-line bg-cream py-0 pl-3 pr-9 font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink"
        }`}
      >
        {locales.map((availableLocale) => (
          <option key={availableLocale} value={availableLocale}>
            {localeLabels[availableLocale]}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={`${styles.chevron} ${
          tone === "bare"
            ? styles.chevronBare
            : tone === "dark"
              ? styles.chevronDark
              : styles.chevronLight
        }`}
      />
    </span>
  );
}
