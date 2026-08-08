import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroSky } from "@/components/hero-sky";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PageTransitionLink } from "@/components/page-transition-link";
import { ScrollReveal } from "@/components/scroll-reveal";
import { AutoLoopVideo } from "@/components/auto-loop-video";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

export default async function LandingPage() {
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const demoVideoUrl = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ?? "/demo.mp4";
  let dashboardHref: string | null = null;

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const supabase = await createSupabaseServerClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims.sub;

    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      dashboardHref = profile?.role === "admin" ? "/admin" : "/dashboard";
    }
  }

  const startConversationHref = dashboardHref ?? "/interview";

  return (
    <main className={styles.page} data-landing-page>
      <HeroSky
        key="mirrored-page-shader-v4"
        shaderRevision="mirrored-page-shader-v4"
        className={styles.pageSky}
      />
      <section className={styles.heroPanel} aria-label={t("landingWelcomeAria")}>
        <div className={styles.heroTop}>
          <Link href="/" className={styles.wordmark} aria-label={t("landingHomeAria")}>
            {locale === "en" ? "WiseShare." : "慧仁享"}
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

            <div className={styles.demoCard}>
              <div className={styles.demoMedia}>
                <AutoLoopVideo
                  className={styles.demoVideo}
                  src={demoVideoUrl}
                  ariaLabel={t("landingDemoAria")}
                  fallback={t("landingDemoFallback")}
                />
              </div>
            </div>
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
                WiseShare<span className={styles.brandDot}>.</span>
              </>
            ) : (
              "慧仁享"
            )}
          </span>
        </Link>
        <div className={styles.footerMeta}>
          <p className={styles.footerNote}>{t("landingFooterNote")}</p>
          <nav className={styles.footerLinks} aria-label="Legal">
            <Link href="/privacy">{t("legalPrivacy")}</Link>
            <Link href="/terms">{t("legalTerms")}</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
