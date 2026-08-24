"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useState,
} from "react";
import { ArrowRight } from "lucide-react";
import {
  startConversation,
  type StartConversationState,
} from "./actions";
import theme from "@/components/interview-theme.module.css";
import { useI18n } from "@/components/i18n-provider";
import type { Locale } from "@/lib/i18n";

const initialState: StartConversationState = {
  error: null,
};

function capitalizeName(value: string) {
  return value.replace(/(^|\s)(\p{L})/gu, (_, space, letter) =>
    `${space}${letter.toLocaleUpperCase()}`,
  );
}

export function StartForm({
  conversationLocale,
}: {
  conversationLocale: Locale | null;
}) {
  const { locale, t } = useI18n();
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [state, formAction, pending] = useActionState(
    startConversation,
    initialState,
  );

  useEffect(() => {
    if (state.error) {
      document.documentElement.removeAttribute("data-page-elements-leaving");
      const resetLeaving = window.setTimeout(() => setLeaving(false), 0);
      return () => window.clearTimeout(resetLeaving);
    }
  }, [state.error]);

  return (
    <>
      <h1 className={`${theme.heading} ${theme.startQuestion} text-4xl sm:text-6xl`}>
        {t("interviewNameQuestion")}
      </h1>
      <form
        action={formAction}
        className={theme.form}
        onSubmit={(event) => {
          if (!event.currentTarget.checkValidity()) {
            return;
          }

          if (leaving && !state.error) {
            return;
          }

          event.preventDefault();
          setLeaving(true);
          document.documentElement.dataset.pageElementsLeaving = "true";

          const formData = new FormData(event.currentTarget);
          window.setTimeout(() => {
            startTransition(() => {
              formAction(formData);
            });
          }, 760);
        }}
      >
        <input
          name="locale"
          type="hidden"
          value={conversationLocale ?? locale}
        />
        <label htmlFor="name" className={theme.visuallyHidden}>
          {t("interviewNameLabel")}
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
            disabled={pending || (leaving && !state.error)}
            className={theme.submitButton}
            aria-label={
              pending || leaving
                ? t("interviewPreparingGreeting")
                : t("interviewContinue")
            }
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

      {leaving && !state.error && (
        <div
          className={theme.nameTransitionSkeleton}
          role="status"
          aria-label={t("interviewPreparingGreeting")}
        >
          <span className={theme.nameSkeletonLine} aria-hidden="true" />
        </div>
      )}
    </>
  );
}
