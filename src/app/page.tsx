import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroSky } from "@/components/hero-sky";
import { AutoLoopVideo } from "@/components/auto-loop-video";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PageTransitionLink } from "@/components/page-transition-link";
import { ScrollReveal } from "@/components/scroll-reveal";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import styles from "./page.module.css";

export default async function LandingPage() {
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  let dashboardHref: string | null = null;

  // The landing page renders for signed-out visitors too, so a database that
  // is not reachable yet must not take it down — it just means no shortcut
  // into the portal.
  try {
    const user = await getSessionUser();
    if (user) {
      const [profile] = await db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      dashboardHref = profile?.role === "admin" ? "/admin" : "/dashboard";
    }
  } catch (error) {
    console.error("Could not resolve the visitor's portal link:", error);
  }

  const startConversationHref = dashboardHref ?? "/interview";

  return (
    <main className={styles.page} data-landing-page>
      <HeroSky
        key="mirrored-page-shader-v4"
        shaderRevision="magenta-violet-page-shader-v5"
        className={styles.pageSky}
      />
      <section className={styles.heroPanel} aria-label={t("landingWelcomeAria")}>
        <div className={styles.heroTop}>
          <Link href="/" className={styles.wordmark} aria-label={t("landingHomeAria")}>
            {locale === "en" ? "WiseShare AI" : "慧享 AI"}
          </Link>
          <nav className={styles.authNav} aria-label={t("landingAccountAria")}>
            <LanguageSwitcher tone="bare" />
            {dashboardHref ? (
              <Link href={dashboardHref} className={styles.navPrimary}>
                {t("commonDashboard")}
              </Link>
            ) : (
              <>
                <Link href="/login" className={styles.navGhost}>
                  {t("landingLogin")}
                </Link>
                <PageTransitionLink href="/signup" className={styles.navPrimary}>
                  {t("landingGetStarted")}
                </PageTransitionLink>
              </>
            )}
          </nav>
        </div>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <h1
              className={`${styles.slogan} ${
                locale === "en" ? "" : styles.localizedSlogan
              }`}
            >
              <span className={styles.sloganLine}>
                {t("landingHeroLine")}
              </span>
              <span className={styles.flipSlot}>
                <span className={styles.flipWord}>{t("landingHeroForever")}</span>
              </span>
            </h1>
            <p className={styles.heroDescription}>
              {t("landingHeroDescription")}
            </p>
            <div className={styles.heroCtas}>
              <PageTransitionLink
                href={startConversationHref}
                className={styles.btnPrimary}
                aria-label={t("landingStartAria")}
              >
                {t("landingStartConversation")}
                <ArrowRight className={styles.btnIcon} aria-hidden="true" />
              </PageTransitionLink>
            </div>
            <ScrollReveal className={styles.demoReveal} distance={20}>
              <div className={styles.demoFrame}>
                <AutoLoopVideo
                  src="/demo.mp4"
                  className={styles.demoVideo}
                  ariaLabel={t("landingDemoAria")}
                  fallback={t("landingDemoFallback")}
                />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section
        className={styles.companionSection}
        aria-labelledby="companion-title"
      >
        <div className={styles.companionQuote} aria-hidden="true">
          <p className={styles.companionQuoteKicker}>{t("landingQuoteKicker")}</p>
          <p className={styles.companionQuoteText}>{t("landingQuote")}</p>
        </div>
        <ScrollReveal className={styles.companionInner} distance={36}>
          <div className={styles.companionCopy}>
            <p className={styles.sectionKicker}>{t("landingCompanionKicker")}</p>
            <h2 id="companion-title" className={styles.sectionTitle}>
              <span className={styles.titleLine}>{t("landingCompanionTitleOne")}</span>
              <span className={styles.titleLine}>{t("landingCompanionTitleTwo")}</span>
            </h2>
            <p className={styles.sectionLead}>{t("landingCompanionBody")}</p>
          </div>
          <ul className={styles.featureList}>
            <li className={styles.featureItem}>
              <span className={styles.featureNumber}>01</span>
              <div>
                <h3>{t("landingFeatureGentleTitle")}</h3>
                <p>{t("landingFeatureGentleBody")}</p>
              </div>
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureNumber}>02</span>
              <div>
                <h3>{t("landingFeatureMemoryTitle")}</h3>
                <p>{t("landingFeatureMemoryBody")}</p>
              </div>
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureNumber}>03</span>
              <div>
                <h3>{t("landingFeaturePrivateTitle")}</h3>
                <p>{t("landingFeaturePrivateBody")}</p>
              </div>
            </li>
          </ul>
        </ScrollReveal>
      </section>

      <section
        id="how-it-works"
        className={styles.infoSection}
        aria-labelledby="how-it-works-title"
      >
        <ScrollReveal
          className={styles.infoInner}
          delay={0.05}
          distance={32}
        >
          <p className={styles.sectionKicker}>{t("landingHowKicker")}</p>
          <h2 id="how-it-works-title" className={styles.sectionTitle}>
            <span className={styles.titleLine}>{t("landingHowTitleOne")}</span>
            <span className={styles.titleLine}>{t("landingHowTitleTwo")}</span>
          </h2>
          <div className={styles.infoGrid}>
            <article className={styles.infoItem}>
              <span className={styles.infoNumber}>01</span>
              <h3>{t("landingStepTalkTitle")}</h3>
              <p>{t("landingStepTalkBody")}</p>
            </article>
            <article className={styles.infoItem}>
              <span className={styles.infoNumber}>02</span>
              <h3>{t("landingStepShapeTitle")}</h3>
              <p>{t("landingStepShapeBody")}</p>
            </article>
            <article className={styles.infoItem}>
              <span className={styles.infoNumber}>03</span>
              <h3>{t("landingStepKeepTitle")}</h3>
              <p>{t("landingStepKeepBody")}</p>
            </article>
          </div>
        </ScrollReveal>
      </section>

      <section className={styles.ctaSection} aria-labelledby="cta-title">
        <ScrollReveal
          className={styles.ctaPanel}
          delay={0.05}
          distance={28}
        >
          <h2 id="cta-title" className={styles.ctaTitle}>
            {t("landingCtaTitle")}
          </h2>
          <p className={styles.ctaSub}>{t("landingCtaBody")}</p>
        <PageTransitionLink href={startConversationHref} className={styles.btnLight}>
          {t("landingStartConversation")}
          <ArrowRight className={styles.btnIcon} aria-hidden="true" />
        </PageTransitionLink>
        </ScrollReveal>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.brand} aria-label={t("landingHomeAria")}>
          <span className={styles.brandName}>
            {locale === "en" ? (
              <>
                WiseShare AI
              </>
            ) : (
              "慧享 AI"
            )}
          </span>
        </Link>
        <div className={styles.footerMeta}>
          <p className={styles.footerNote}>{t("landingFooterNote")}</p>
          <nav
            className={styles.footerLinks}
            aria-label={locale === "en" ? "Legal" : locale === "zh-Hans" ? "法律信息" : "法律資訊"}
          >
            <Link href="/privacy">{t("legalPrivacy")}</Link>
            <Link href="/terms">{t("legalTerms")}</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
