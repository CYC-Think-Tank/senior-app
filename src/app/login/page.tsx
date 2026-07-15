"use client";

import { useState } from "react";
import { MailCheck, Send } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { Card, Wordmark, buttonStyles, inputStyles } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark />
          <p className="mt-2 text-ink-soft">
            Sign in to listen to your family&apos;s stories.
          </p>
        </div>

        <Card className="p-8">
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto mb-4 h-10 w-10 text-sage" />
              <h1 className="font-serif text-2xl font-semibold">
                Check your email
              </h1>
              <p className="mt-2 text-ink-soft">
                We sent a sign-in link to <strong>{email}</strong>. Open it on
                this device to continue.
              </p>
            </div>
          ) : (
            <form onSubmit={sendLink} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-ink-soft"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputStyles}
                />
              </div>
              {error && <p className="text-sm text-ember-deep">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className={`${buttonStyles.primary} w-full`}
              >
                <Send className="h-4 w-4" />
                {busy ? "Sending…" : "Email me a sign-in link"}
              </button>
              <p className="text-center text-sm text-ink-faint">
                No password needed — {APP_NAME} signs you in by email.
              </p>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
