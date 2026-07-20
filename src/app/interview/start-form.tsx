"use client";

import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  startConversation,
  type StartConversationState,
} from "./actions";
import theme from "@/components/interview-theme.module.css";

const initialState: StartConversationState = {
  error: null,
};

export function StartForm() {
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(true);
  const [state, formAction, pending] = useActionState(
    startConversation,
    initialState,
  );

  return (
    <form action={formAction} className={theme.form}>
      <label
        htmlFor="name"
        className={theme.visuallyHidden}
      >
        Your name
      </label>
      <div
        className={`${theme.formRow} ${!name ? theme.empty : ""}`}
      >
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          autoComplete="name"
          maxLength={80}
          className={theme.input}
          onChange={(event) => setName(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {!name && focused && (
          <span className={theme.customCaret} aria-hidden="true" />
        )}
        <button
          type="submit"
          disabled={pending}
          className={theme.submitButton}
          aria-label={pending ? "Getting ready..." : "Continue"}
        >
          <ArrowRight aria-hidden="true" />
        </button>
      </div>

      <input name="website" type="hidden" />

      {state.error && (
        <p className={theme.formError} role="alert">
          {state.error}
        </p>
      )}

    </form>
  );
}
