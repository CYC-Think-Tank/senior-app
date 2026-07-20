"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { localeLabels, locales, type Locale } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import { setLocaleAction } from "@/app/language/actions";

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale } = useI18n();
  const [pending, startTransition] = useTransition();

  function setLocale(nextLocale: Locale) {
    startTransition(async () => {
      await setLocaleAction(nextLocale);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex rounded-lg border border-line bg-cream p-1 text-sm">
      {locales.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLocale(item)}
          disabled={pending}
          className={`rounded-md px-2.5 py-1 font-medium ${
            item === locale
              ? "bg-ember text-cream"
              : "text-ink-soft hover:bg-paper-deep hover:text-ink"
          }`}
        >
          {localeLabels[item]}
        </button>
      ))}
    </div>
  );
}
