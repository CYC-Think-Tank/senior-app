import Link from "next/link";
import { cookies } from "next/headers";
import { LogIn, LogOut } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { Wordmark } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PortalShell, portalStyles } from "@/components/portal-shell";
import { RouteContentEntrance } from "@/components/page-entrance";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";

export default async function FeedLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };

  return (
    <PortalShell>
      <header className={portalStyles.header}>
        <div className={portalStyles.headerInner}>
          <div className={portalStyles.headerBrand}><Wordmark tone="light" /></div>
          <nav className={portalStyles.nav} aria-label="Episode navigation">
            {user ? <Link href="/family" className={portalStyles.navLink}>{t("commonFamily")}</Link> : null}
            {profile?.role === "admin" ? <Link href="/admin" className={portalStyles.navLink}>{t("commonAdmin")}</Link> : null}
          </nav>
          <div className={portalStyles.headerTools}>
            <LanguageSwitcher tone="bare" />
            {user ? (
              <form action={signOut}><button className={portalStyles.headerAction}><LogOut className="h-4 w-4" /> {t("commonSignOut")}</button></form>
            ) : (
              <Link href="/login" className={portalStyles.headerAction}><LogIn className="h-4 w-4" /> {t("commonSignIn")}</Link>
            )}
          </div>
        </div>
      </header>
      <main className={portalStyles.main}>
        <div className={portalStyles.surface}>
          <RouteContentEntrance>{children}</RouteContentEntrance>
        </div>
      </main>
    </PortalShell>
  );
}
