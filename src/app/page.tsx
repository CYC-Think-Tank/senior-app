import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { cookies } from "next/headers";
import { HeroSky } from "@/components/hero-sky";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PageTransitionLink } from "@/components/page-transition-link";
import { ScrollReveal } from "@/components/scroll-reveal";
import { AutoLoopVideo } from "@/components/auto-loop-video";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";
import styles from "./page.module.css";

export default async function LandingPage() {
  const locale = normalizeLocale(
    (await cookies()).get(localeCookieName)?.value,
  );
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const demoVideoUrl = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ?? "/demo.mp4";

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
            Fireside.
          </Link>
          <nav className={styles.authNav} aria-label={t("landingAccountAria")}>
            <LanguageSwitcher tone="bare" />
            <Link href="/feed" className={styles.navGhost}>
              {t("commonEpisodes")}
            </Link>
            <Link href="/login" className={styles.navGhost}>
              {t("landingLogin")}
            </Link>
            <PageTransitionLink href="/signup" className={styles.navPrimary}>
              {t("landingGetStarted")}
            </PageTransitionLink>
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
                href="/interview"
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
                  poster="/oldschool.webp"
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
        <PageTransitionLink href="/interview" className={styles.btnLight}>
          {t("landingStartConversation")}
          <ArrowRight className={styles.btnIcon} aria-hidden="true" />
        </PageTransitionLink>
        </ScrollReveal>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.brand} aria-label={t("landingHomeAria")}>
          <span className={styles.logoChip}>
            <Image
              src="/firesidelogo.png"
              alt=""
              width={26}
              height={26}
              className={styles.logo}
            />
          </span>
          <span className={styles.brandName}>
            Fireside<span className={styles.brandDot}>.</span>
          </span>
        </Link>
        <p className={styles.footerNote}>{t("landingFooterNote")}</p>
      </footer>
    </main>
  );
}
