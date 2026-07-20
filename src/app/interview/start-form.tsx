"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  startConversation,
  type StartConversationState,
} from "./actions";
import theme from "@/components/interview-theme.module.css";

const initialState: StartConversationState = {
  error: null,
};

function capitalizeName(value: string) {
  return value.replace(/(^|\s)(\p{L})/gu, (_, space, letter) =>
    `${space}${letter.toLocaleUpperCase()}`,
  );
}

export function StartForm() {
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(true);
  const [state, formAction, pending] = useActionState(
    startConversation,
    initialState,
  );

  useEffect(() => {
    if (state.error) {
      document.documentElement.removeAttribute("data-page-elements-leaving");
    }
  }, [state.error]);

  return (
    <form
      action={formAction}
      className={theme.form}
      onSubmit={(event) => {
        if (event.currentTarget.checkValidity()) {
          document.documentElement.dataset.pageElementsLeaving = "true";
        }
      }}
    >
      <label htmlFor="name" className={theme.visuallyHidden}>
        Your name
      </label>
      <div className={`${theme.formRow} ${!name ? theme.empty : ""}`}>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          autoComplete="name"
          maxLength={80}
          className={theme.input}
          value={name}
          onChange={(event) => setName(capitalizeName(event.target.value))}
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
