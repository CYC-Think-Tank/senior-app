"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  dictionaries,
  type I18nKey,
  type Locale,
  translate,
} from "@/lib/i18n";

const I18nContext = createContext<{
  locale: Locale;
  t: (key: I18nKey, values?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
} | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [activeLocale, setActiveLocale] = useState(locale);
  const previousServerLocale = useRef(locale);

  useEffect(() => {
    if (previousServerLocale.current === locale) return;
    previousServerLocale.current = locale;

    const frame = window.requestAnimationFrame(() => {
      document.documentElement.removeAttribute("data-language-transition");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale: activeLocale,
      t: (key: I18nKey, values?: Record<string, string | number>) =>
        translate(activeLocale, key, values),
      setLocale: setActiveLocale,
    }),
    [activeLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      locale: "en" as Locale,
      t: (key: I18nKey, values?: Record<string, string | number>) =>
        dictionaries.en[key].replace(/\{(\w+)\}/g, (_, name: string) =>
          String(values?.[name] ?? "")
        ),
      setLocale: () => undefined,
    };
  }
  return context;
}
