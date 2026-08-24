"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/app/language/actions";
import { useI18n } from "@/components/i18n-provider";
import {
  conversationLanguageLabels,
  conversationLanguageDraftCookieName,
  localeCookieName,
  localeLabels,
  locales,
  type Locale,
} from "@/lib/i18n";
import styles from "./conversation-language-picker.module.css";

export function ConversationLanguagePicker({
  initialLocale = null,
}: {
  initialLocale?: Locale | null;
}) {
  const router = useRouter();
  const { setLocale, t } = useI18n();
  const [selectedLocale, setSelectedLocale] = useState<Locale | null>(
    initialLocale,
  );
  const [, startTransition] = useTransition();
  const changeId = useRef(0);
  const savedLocale = useRef<Locale | null>(initialLocale);

  useEffect(() => {
    if (!selectedLocale || savedLocale.current === selectedLocale) return;

    savedLocale.current = selectedLocale;
    const currentChangeId = ++changeId.current;
    setLocale(selectedLocale);
    document.documentElement.lang = selectedLocale;
    document.cookie = `${localeCookieName}=${selectedLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.cookie = `${conversationLanguageDraftCookieName}=${selectedLocale}; Path=/; Max-Age=86400; SameSite=Lax`;

    void setLocaleAction(selectedLocale)
      .then(() => {
        if (currentChangeId !== changeId.current) return;
        startTransition(() => router.refresh());
      })
      .catch((cause) => {
        console.error("Could not save the conversation language:", cause);
      });
  }, [router, selectedLocale, setLocale]);

  function chooseLocale(nextLocale: Locale) {
    setSelectedLocale(nextLocale);
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{t("interviewLanguageQuestion")}</legend>
      <p className={styles.hint}>{t("interviewLanguageHint")}</p>
      <div className={styles.options}>
        {locales.map((availableLocale) => (
          <label className={styles.option} key={availableLocale}>
            <input
              className={styles.radio}
              type="radio"
              name="locale"
              value={availableLocale}
              checked={selectedLocale === availableLocale}
              onChange={() => chooseLocale(availableLocale)}
              required
            />
            <span className={styles.optionText}>
              <span>{localeLabels[availableLocale]}</span>
              {conversationLanguageLabels[availableLocale] !==
              localeLabels[availableLocale] ? (
                <span className={styles.spokenLanguage}>
                  {conversationLanguageLabels[availableLocale]}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
