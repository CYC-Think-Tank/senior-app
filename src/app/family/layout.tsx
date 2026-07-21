import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { Wordmark } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";
import { personName } from "@/lib/names";

export default async function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user } = await requireUser();
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, email")
    .eq("id", user.id)
    .single();
  const name = personName(profile?.display_name, profile?.email ?? user.email);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Wordmark href="/family" />
          <div className="flex items-center gap-2">
            <Link
              href="/feed"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink"
            >
              {t("commonViewFeed")}
            </Link>
            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink"
              >
                {t("commonAdmin")}
              </Link>
            )}
            <LanguageSwitcher />
            <UserMenu name={name} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
