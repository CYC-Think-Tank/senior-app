import Link from "next/link";
import { Headphones, Mic, Scissors } from "lucide-react";
import { APP_NAME, TAGLINE } from "@/lib/constants";
import { HOST_NAME } from "@/lib/realtime/interviewer-prompt";
import { Card, Wordmark, buttonStyles } from "@/components/ui";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Wordmark />
        <Link href="/login" className={buttonStyles.secondary}>
          Sign in
        </Link>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 pb-20 pt-16 text-center sm:pt-24">
          <p className="mx-auto inline-block rounded-full bg-ember-soft px-5 py-1.5 text-sm font-medium text-ember-deep">
            A private audio memoir, one conversation at a time
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl font-serif text-5xl font-semibold leading-tight tracking-tight sm:text-7xl">
            {TAGLINE}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-ink-soft">
            {APP_NAME} records warm, unhurried conversations with the
            storyteller in your family — no typing, no reading, just talking —
            and turns them into podcast episodes only your family can hear.
          </p>
          <div className="mt-10">
            <Link
              href="/login"
              className={`${buttonStyles.primary} px-8 py-4 text-lg`}
            >
              Listen to your family&apos;s stories
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="grid gap-6 sm:grid-cols-3">
            <Card className="p-8">
              <Mic className="h-8 w-8 text-ember" />
              <h2 className="mt-4 font-serif text-2xl font-semibold">
                They just talk
              </h2>
              <p className="mt-2 leading-relaxed text-ink-soft">
                {HOST_NAME}, a patient AI host, asks about their life — the
                village, the first job, the day they met — and simply listens.
              </p>
            </Card>
            <Card className="p-8">
              <Scissors className="h-8 w-8 text-ember" />
              <h2 className="mt-4 font-serif text-2xl font-semibold">
                We craft the episode
              </h2>
              <p className="mt-2 leading-relaxed text-ink-soft">
                Each conversation is gently edited into a polished episode —
                and nothing is released until the storyteller hears it and
                approves.
              </p>
            </Card>
            <Card className="p-8">
              <Headphones className="h-8 w-8 text-ember" />
              <h2 className="mt-4 font-serif text-2xl font-semibold">
                Family listens
              </h2>
              <p className="mt-2 leading-relaxed text-ink-soft">
                Episodes arrive on a private feed for invited family only — a
                growing archive of a life, told in their own voice.
              </p>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center text-sm text-ink-faint">
        {APP_NAME} — private by design. Stories belong to the family.
      </footer>
    </div>
  );
}
