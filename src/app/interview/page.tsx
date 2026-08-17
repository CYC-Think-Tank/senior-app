import { InterviewShell } from "@/components/interview-shell";
import theme from "@/components/interview-theme.module.css";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { StartForm } from "./start-form";

export default async function StartInterviewPage() {
  const locale = await getPreferredLocale();

  return (
    <InterviewShell>
      <div className={`${theme.screen} ${theme.startScreen}`}>
        <h1 className={`${theme.heading} ${theme.startQuestion} text-4xl sm:text-6xl`}>
          {translate(locale, "interviewNameQuestion")}
        </h1>
        <StartForm />
      </div>
    </InterviewShell>
  );
}
