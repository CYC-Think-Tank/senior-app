import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { InterviewShell } from "@/components/interview-shell";
import theme from "@/components/interview-theme.module.css";
import {
  conversationLanguageChosenCookieName,
  conversationLanguageDraftCookieName,
  localeFromValue,
} from "@/lib/i18n";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { guests, profiles, sessions } from "@/lib/db/schema";
import { AnonymousLanguageStep } from "./anonymous-language-step";
import { SignedInStartForm } from "./signed-in-start-form";

export default async function StartInterviewPage() {
  const cookieStore = await cookies();
  const initialLanguageChoice = localeFromValue(
    cookieStore.get(conversationLanguageDraftCookieName)?.value,
  );
  const user = await getSessionUser();

  if (user) {
    const [existingSession, profileRows] = await Promise.all([
      db
        .select({ id: sessions.id })
        .from(sessions)
        .innerJoin(guests, eq(guests.id, sessions.guestId))
        .where(eq(guests.userId, user.id))
        .limit(1),
      db
        .select({ chosenAt: profiles.conversationLanguageChosenAt })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1),
    ]);

    // Returning signed-in storytellers start from their dashboard, where the
    // regular one-click flow is available. This page is their first-run setup.
    if (existingSession.length > 0 || profileRows[0]?.chosenAt) {
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
