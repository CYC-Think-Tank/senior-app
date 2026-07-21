import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { HeroSky } from "@/components/hero-sky";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PageTransitionLink } from "@/components/page-transition-link";
import { ScrollReveal } from "@/components/scroll-reveal";
import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <main className={styles.page} data-landing-page>
      <HeroSky
        key="mirrored-page-shader-v4"
        shaderRevision="mirrored-page-shader-v4"
        className={styles.pageSky}
      />
      <section className={styles.heroPanel} aria-label="Welcome">
        <div className={styles.heroTop}>
          <Link href="/" className={styles.wordmark} aria-label="Fireside home">
            Fireside.
          </Link>
          <nav className={styles.authNav} aria-label="Account">
            <LanguageSwitcher tone="bare" />
            <Link href="/login" className={styles.navGhost}>
              Log in
            </Link>
            <PageTransitionLink href="/interview" className={styles.navPrimary}>
              Get started
            </PageTransitionLink>
          </nav>
        </div>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <h1 className={styles.slogan}>
              <span className={styles.sloganLine}>
                Your stories are worth keeping
              </span>
              <span className={styles.flipSlot}>
                <span className={styles.flipWord}>forever.</span>
              </span>
            </h1>
            <div className={styles.heroCtas}>
              <PageTransitionLink
                href="/interview"
                className={styles.btnPrimary}
                aria-label="Start a conversation with the AI"
              >
                Start a conversation
                <ArrowRight className={styles.btnIcon} aria-hidden="true" />
              </PageTransitionLink>
            </div>
          </div>
        </div>
      </section>

      <section
        className={styles.companionSection}
        aria-labelledby="companion-title"
      >
        <ScrollReveal className={styles.companionInner} distance={36}>
          <div className={styles.companionCopy}>
            <p className={styles.sectionKicker}>Daily companionship</p>
            <h2 id="companion-title" className={styles.sectionTitle}>
              <span className={styles.titleLine}>A warm hello,</span>
              <span className={styles.titleLine}>
                whenever it&rsquo;s needed.
              </span>
            </h2>
            <p className={styles.sectionLead}>
              Loneliness fades when someone checks in. Fireside starts gentle
              conversations, listens with endless patience, and always has time
              for one more story.
            </p>
          </div>
          <ul className={styles.featureList}>
            <li className={styles.featureItem}>
              <span className={styles.featureNumber}>01</span>
              <div>
                <h3>Gentle conversations</h3>
                <p>
                  Friendly questions that are easy to answer, at whatever pace
                  feels right.
                </p>
              </div>
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureNumber}>02</span>
              <div>
                <h3>Company that remembers</h3>
                <p>
                  A patient listener who recalls favorite topics and asks about
                  them next time.
                </p>
              </div>
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureNumber}>03</span>
              <div>
                <h3>Private by default</h3>
                <p>
                  Conversations stay in the family. Nothing is shared without a
                  say-so.
                </p>
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
          <p className={styles.sectionKicker}>How it works</p>
          <h2 id="how-it-works-title" className={styles.sectionTitle}>
            <span className={styles.titleLine}>From hello to heirloom,</span>
            <span className={styles.titleLine}>in three easy steps.</span>
          </h2>
          <div className={styles.infoGrid}>
            <article className={styles.infoItem}>
              <span className={styles.infoNumber}>01</span>
              <h3>Talk naturally</h3>
              <p>
                The AI host asks gentle questions and lets the storyteller
                answer in their own voice.
              </p>
            </article>
            <article className={styles.infoItem}>
              <span className={styles.infoNumber}>02</span>
              <h3>Shape the memory</h3>
              <p>
                Each conversation becomes a polished private episode, ready for
                review before anyone else hears it.
              </p>
            </article>
            <article className={styles.infoItem}>
              <span className={styles.infoNumber}>03</span>
              <h3>Keep it close</h3>
              <p>
                Family listens through a private feed, building an archive of a
                life told first-hand.
              </p>
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
            Pull up a chair.
          </h2>
          <p className={styles.ctaSub}>
            The kettle&rsquo;s on and someone is ready to listen. Start the
            first conversation tonight.
          </p>
        <PageTransitionLink href="/interview" className={styles.btnLight}>
          Start a conversation
          <ArrowRight className={styles.btnIcon} aria-hidden="true" />
        </PageTransitionLink>
        </ScrollReveal>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.brand} aria-label="Fireside home">
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
        <p className={styles.footerNote}>Every life is worth the telling.</p>
      </footer>
    </main>
  );
}
