"use client";

import { ArrowRight } from "lucide-react";
import { startMyConversation } from "@/app/dashboard/actions";
import { useI18n } from "@/components/i18n-provider";
import theme from "@/components/interview-theme.module.css";
import type { Locale } from "@/lib/i18n";
import { ConversationLanguagePicker } from "./conversation-language-picker";

export function SignedInStartForm({
  initialLanguageChoice,
}: {
  initialLanguageChoice: Locale | null;
}) {
  const { t } = useI18n();

  return (
    <>
      <h1 className={`${theme.heading} ${theme.startQuestion} text-4xl sm:text-6xl`}>
        {t("interviewFirstConversationTitle")}
      </h1>
      <form
        action={startMyConversation}
        className={`${theme.form} ${theme.formWithLanguage}`}
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
