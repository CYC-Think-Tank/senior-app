import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { InterviewShell } from "@/components/interview-shell";
import theme from "@/components/interview-theme.module.css";
import {
  conversationLanguageChosenCookieName,
  conversationLanguageDraftCookieName,
  localeFromValue,
} from "@/lib/i18n";
import { StartForm } from "../start-form";

export default async function InterviewNamePage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const submittedLocale = localeFromValue(params.locale);
  const draftLocale = localeFromValue(
    cookieStore.get(conversationLanguageDraftCookieName)?.value,
  );
  const hasCompletedLanguageStep = cookieStore.has(
    conversationLanguageChosenCookieName,
  );
  const conversationLocale = submittedLocale ?? draftLocale;

  // A first-time anonymous visitor should not be able to skip the language
  // screen by navigating directly to the name route.
  if (!hasCompletedLanguageStep && !conversationLocale) {
    redirect("/interview");
  }

  return (
    <InterviewShell homeHref="/">
      <div className={`${theme.screen} ${theme.startScreen}`}>
        <StartForm conversationLocale={conversationLocale} />
      </div>
    </InterviewShell>
  );
}
