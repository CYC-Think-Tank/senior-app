import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { Wordmark } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";
import {
  PortalShell,
  portalStyles,
} from "@/components/portal-shell";
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
    <PortalShell>
      <header className={portalStyles.header}>
        <div
          className={`${portalStyles.headerInner} ${portalStyles.headerInnerNarrow}`}
        >
          <div className={portalStyles.headerBrand}>
            <Wordmark href="/family" tone="light" />
          </div>
          <nav className={portalStyles.nav} aria-label="Family navigation">
            <Link
              href="/feed"
              className={portalStyles.navLink}
            >
              {t("commonViewFeed")}
            </Link>
            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className={portalStyles.navLink}
              >
                {t("commonAdmin")}
              </Link>
            )}
          </nav>
          <div className={portalStyles.headerTools}>
            <LanguageSwitcher tone="bare" />
            <UserMenu name={name} tone="dark" />
          </div>
        </div>
      </header>
      <main className={`${portalStyles.main} ${portalStyles.mainNarrow}`}>
        <div className={portalStyles.surface}>{children}</div>
      </main>
    </PortalShell>
  );
}
