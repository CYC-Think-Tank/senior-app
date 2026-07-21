"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { setLocaleAction } from "@/app/language/actions";
import styles from "@/components/language-switcher.module.css";

export function LanguageSwitcher({
  tone = "light",
}: {
  tone?: "light" | "dark" | "bare";
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const [pending, startTransition] = useTransition();

  function toggleLocale() {
    const nextLocale = locale === "en" ? "zh-Hans" : "en";

    startTransition(async () => {
      await setLocaleAction(nextLocale);
      router.refresh();
    });
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
      aria-label={locale === "en" ? "Switch to Chinese" : "Switch to English"}
    >
      {locale === "en" ? "中文" : "English"}
    </button>
  );
}
