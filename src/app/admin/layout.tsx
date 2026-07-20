import Link from "next/link";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";
import { Wordmark } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Wordmark href="/admin" />
            <nav className="flex items-center gap-1 text-sm font-medium">
              <Link
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-ink-soft hover:bg-paper-deep hover:text-ink"
              >
                {t("commonDashboard")}
              </Link>
              <Link
                href="/admin/guests/new"
                className="rounded-lg px-3 py-1.5 text-ink-soft hover:bg-paper-deep hover:text-ink"
              >
                {t("commonNewGuest")}
              </Link>
              <Link
                href="/feed"
                className="rounded-lg px-3 py-1.5 text-ink-soft hover:bg-paper-deep hover:text-ink"
              >
                {t("commonViewFeed")}
              </Link>
            </nav>
          </div>
          <LanguageSwitcher />
          <form action={signOut}>
            <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink">
              <LogOut className="h-4 w-4" /> {t("commonSignOut")}
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
