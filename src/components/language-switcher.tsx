"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
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
  openUp = false,
}: {
  tone?: "light" | "dark" | "bare";
  /** Place the menu above its trigger, as in a bottom-pinned sidebar. */
  openUp?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, setLocale } = useI18n();
  const [optimisticLocale, setOptimisticLocale] = useState<Locale | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
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

  useEffect(() => {
    if (!open) return;

    function closeFromOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, [open]);

  function openMenu(focusIndex = locales.indexOf(displayLocale)) {
    if (preparing || pending) return;
    setOpen(true);
    window.requestAnimationFrame(() => {
      optionRefs.current[Math.max(0, focusIndex)]?.focus();
    });
  }

  function moveOptionFocus(currentIndex: number, direction: 1 | -1) {
    const nextIndex = (currentIndex + direction + locales.length) % locales.length;
    optionRefs.current[nextIndex]?.focus();
  }

  function optionKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveOptionFocus(index, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveOptionFocus(index, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      optionRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      optionRefs.current[locales.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

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
      const savePreference = setLocaleAction(nextLocale).catch((cause) => {
        console.error("Could not save the language preference:", cause);
      });

      // Admin overview pages read their copy from the client locale context,
      // so changing language there does not need to rerun auth and data reads.
      if (needsServerRefresh) {
        // A signed-in profile is authoritative. Refreshing before its update
        // finishes can bring the old locale straight back into the provider.
        void savePreference.then(() => {
          startTransition(() => {
            router.refresh();
          });

          // The provider clears the transition as soon as refreshed server
          // copy arrives. This fallback prevents a failed refresh leaving text
          // faded.
          safetyTimerRef.current = window.setTimeout(() => {
            document.documentElement.removeAttribute(
              "data-language-transition",
            );
          }, 1600);
        });
      } else {
        void savePreference;
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
    <span
      ref={rootRef}
      className={`${styles.wrapper} ${openUp ? styles.openUp : ""}`}
      data-open={open}
    >
      <span
        id={menuId}
        className={`${styles.menuRegion} ${
          tone === "bare"
            ? styles.menuBare
            : tone === "dark"
              ? styles.menuDark
              : styles.menuLight
        }`}
        data-open={open}
        aria-hidden={!open}
      >
        <span className={styles.menuClip}>
          <span className={styles.menu} role="menu" aria-label="Language">
            {locales.map((availableLocale, index) => {
              const selected = availableLocale === displayLocale;
              return (
                <button
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  tabIndex={-1}
                  className={`${styles.option} ${
                    selected ? styles.optionSelected : ""
                  }`}
                  onClick={() => {
                    selectLocale(availableLocale);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  onKeyDown={(event) => optionKeyDown(event, index)}
                  key={availableLocale}
                >
                  <span>{localeLabels[availableLocale]}</span>
                  <Check
                    className={styles.optionCheck}
                    data-visible={selected}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </span>
        </span>
      </span>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
        disabled={preparing || pending}
        aria-busy={preparing || pending}
        aria-label="Language"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`${styles.control} inline-flex min-h-10 cursor-pointer items-center rounded-lg border text-sm disabled:cursor-wait disabled:opacity-60 ${
          tone === "bare"
            ? `${styles.bare} border-transparent bg-transparent px-3 py-0 font-medium`
            : tone === "dark"
              ? "border-white/20 bg-white/10 px-3 py-0 font-semibold text-cream hover:bg-white/16"
              : "border-line bg-cream px-3 py-0 font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink"
        }`}
      >
        <span>{localeLabels[displayLocale]}</span>
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
      </button>
    </span>
  );
}
