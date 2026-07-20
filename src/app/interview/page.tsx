import { InterviewShell } from "@/components/interview-shell";
import { StartForm } from "./start-form";

export default function StartInterviewPage() {
  return (
    <InterviewShell>
      <p className="text-2xl text-ink-soft">Before we begin</p>
      <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-6xl">
        What should I call you?
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-xl leading-relaxed text-ink-soft">
        Rosie will use your name to welcome you into the conversation.
      </p>
      <StartForm />
    </InterviewShell>
  );
}
