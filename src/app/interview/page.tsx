import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { InterviewShell } from "@/components/interview-shell";
import theme from "@/components/interview-theme.module.css";
import {
  conversationLanguageChosenCookieName,
  conversationLanguageDraftCookieName,
  localeFromValue,
} from "@/lib/i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnonymousLanguageStep } from "./anonymous-language-step";
import { SignedInStartForm } from "./signed-in-start-form";

export default async function StartInterviewPage() {
  const cookieStore = await cookies();
  const initialLanguageChoice = localeFromValue(
    cookieStore.get(conversationLanguageDraftCookieName)?.value,
  );
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;

  if (userId) {
    const admin = createSupabaseAdminClient();
    const [{ data: existingSession }, { data: profile }] = await Promise.all([
      admin
        .from("sessions")
        .select("id, guests!inner(user_id)")
        .eq("guests.user_id", userId)
        .limit(1)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("conversation_language_chosen_at")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    // Returning signed-in storytellers start from their dashboard, where the
    // regular one-click flow is available. This page is their first-run setup.
    if (existingSession || profile?.conversation_language_chosen_at) {
      redirect("/dashboard");
    }

    return (
      <InterviewShell homeHref="/dashboard">
        <div className={`${theme.screen} ${theme.startScreen}`}>
          <SignedInStartForm initialLanguageChoice={initialLanguageChoice} />
        </div>
      </InterviewShell>
    );
  }

  const showLanguageChoice = !cookieStore.has(
    conversationLanguageChosenCookieName,
  );

  if (!showLanguageChoice) redirect("/interview/name");

  return (
    <InterviewShell homeHref="/">
      <div className={`${theme.screen} ${theme.startScreen}`}>
        <AnonymousLanguageStep
          initialLanguageChoice={initialLanguageChoice}
        />
      </div>
    </InterviewShell>
  );
}
