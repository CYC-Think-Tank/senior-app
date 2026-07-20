"use client";

import { useActionState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
  startConversation,
  type StartConversationState,
} from "./actions";

const initialState: StartConversationState = {
  error: null,
};

export function StartForm() {
  const [state, formAction, pending] = useActionState(
    startConversation,
    initialState,
  );

  return (
    <form action={formAction} className="mx-auto mt-10 max-w-xl text-left">
      <label
        htmlFor="name"
        className="mb-2 block text-base font-semibold text-ink-soft"
      >
        Your name
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          autoComplete="name"
          maxLength={80}
          placeholder="How should Rosie greet you?"
          className="h-16 min-w-0 flex-1 rounded-2xl border-2 border-line bg-cream px-5 text-lg text-ink shadow-sm placeholder:text-ink-faint focus:border-ember focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-16 items-center justify-center gap-2 rounded-2xl bg-ember px-7 text-lg font-semibold text-cream shadow-lg shadow-ember/20 transition-colors hover:bg-ember-deep disabled:pointer-events-none disabled:opacity-60"
        >
          <span>{pending ? "Getting ready..." : "Continue"}</span>
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <input name="website" type="hidden" />

      {state.error && (
        <p className="mt-3 text-sm text-ember-deep" role="alert">
          {state.error}
        </p>
      )}

      <p className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-faint">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        Your microphone stays off until you choose to begin.
      </p>
    </form>
  );
}
