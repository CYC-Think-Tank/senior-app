"use client";

import { createContext, useContext, useMemo } from "react";
import {
  dictionaries,
  type I18nKey,
  type Locale,
  translate,
} from "@/lib/i18n";

const I18nContext = createContext<{
  locale: Locale;
  t: (key: I18nKey, values?: Record<string, string | number>) => string;
} | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      locale,
      t: (key: I18nKey, values?: Record<string, string | number>) =>
        translate(locale, key, values),
    }),
    [locale]
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
    };
  }
  return context;
}
