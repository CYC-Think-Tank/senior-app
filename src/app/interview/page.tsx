import { InterviewShell } from "@/components/interview-shell";
import theme from "@/components/interview-theme.module.css";
import { StartForm } from "./start-form";

export default function StartInterviewPage() {
  return (
    <InterviewShell>
      <div className={`${theme.screen} ${theme.startScreen}`}>
        <h1 className={`${theme.heading} ${theme.startQuestion} text-4xl sm:text-6xl`}>
          What should I call you?
        </h1>
        <StartForm />
      </div>
    </InterviewShell>
  );
}
