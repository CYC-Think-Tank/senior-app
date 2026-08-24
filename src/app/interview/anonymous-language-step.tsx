"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import theme from "@/components/interview-theme.module.css";
import { localeFromValue, type Locale } from "@/lib/i18n";
import { ConversationLanguagePicker } from "./conversation-language-picker";

export function AnonymousLanguageStep({
  initialLanguageChoice,
}: {
  initialLanguageChoice: Locale | null;
}) {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <>
      <h1 className={`${theme.heading} ${theme.startQuestion} text-4xl sm:text-6xl`}>
        {t("interviewFirstConversationTitle")}
      </h1>
      <form
        className={`${theme.form} ${theme.formWithLanguage}`}
        onSubmit={(event) => {
          event.preventDefault();
          const locale = localeFromValue(
            String(new FormData(event.currentTarget).get("locale") ?? ""),
          );
          if (!locale) return;
          router.push(`/interview/name?locale=${encodeURIComponent(locale)}`);
        }}
      >
        <ConversationLanguagePicker initialLocale={initialLanguageChoice} />
        <button className={theme.languageContinueButton} type="submit">
          {t("interviewContinue")}
          <ArrowRight aria-hidden="true" />
        </button>
      </form>
    </>
  );
}
