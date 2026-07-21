import Link from "next/link";
import { cookies } from "next/headers";
import { LogIn, LogOut } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { Wordmark } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";

export default async function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  // The feed is public — a signed-in user just gets extra nav.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Wordmark href="/feed" />
          <div className="flex items-center gap-2">
            {user && (
              <Link
                href="/family"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink"
              >
                {t("commonFamily")}
              </Link>
            )}
            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink"
              >
                {t("commonAdmin")}
              </Link>
            )}
            <LanguageSwitcher />
            {user ? (
              <form action={signOut}>
                <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink">
                  <LogOut className="h-4 w-4" /> {t("commonSignOut")}
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink"
              >
                <LogIn className="h-4 w-4" /> {t("commonSignIn")}
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
