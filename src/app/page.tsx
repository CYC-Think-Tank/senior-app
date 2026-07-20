import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  HeartHandshake,
  MessagesSquare,
  Mic,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { HeroSky } from "@/components/hero-sky";
import { PageTransitionLink } from "@/components/page-transition-link";
import { ScrollReveal } from "@/components/scroll-reveal";
import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <HeroSky className={styles.pageSky} />
      <section className={styles.heroPanel} aria-label="Welcome">
        <div className={styles.heroTop}>
          <Link href="/" className={styles.wordmark} aria-label="Fireside home">
            Fireside.
          </Link>
          <nav className={styles.authNav} aria-label="Account">
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
              A warm hello, whenever it&rsquo;s needed.
            </h2>
            <p className={styles.sectionLead}>
              Loneliness fades when someone checks in. Fireside starts gentle
              conversations, listens with endless patience, and always has time
              for one more story.
            </p>
            <ul className={styles.featureList}>
              <li className={styles.featureItem}>
                <span className={`${styles.featureIcon} ${styles.iconEmber}`}>
                  <MessagesSquare aria-hidden="true" />
                </span>
                <div>
                  <h3>Gentle conversations</h3>
                  <p>
                    Friendly questions that are easy to answer, at whatever pace
                    feels right.
                  </p>
                </div>
              </li>
              <li className={styles.featureItem}>
                <span className={`${styles.featureIcon} ${styles.iconSage}`}>
                  <HeartHandshake aria-hidden="true" />
                </span>
                <div>
                  <h3>Company that remembers</h3>
                  <p>
                    A patient listener who recalls favorite topics and asks
                    about them next time.
                  </p>
                </div>
              </li>
              <li className={styles.featureItem}>
                <span className={`${styles.featureIcon} ${styles.iconAmber}`}>
                  <ShieldCheck aria-hidden="true" />
                </span>
                <div>
                  <h3>Private by default</h3>
                  <p>
                    Conversations stay in the family. Nothing is shared without
                    a say-so.
                  </p>
                </div>
              </li>
            </ul>
          </div>
          <div className={styles.companionArt} aria-hidden="true">
            <div className={styles.collage}>
              <Image
                src="/fishing.jpg"
                alt=""
                width={420}
                height={283}
                className={`${styles.collagePhoto} ${styles.collageOne}`}
              />
              <Image
                src="/oldrandom.jpg"
                alt=""
                width={380}
                height={226}
                className={`${styles.collagePhoto} ${styles.collageTwo}`}
              />
              <Image
                src="/oldkids.jpg"
                alt=""
                width={190}
                height={188}
                className={`${styles.collagePhoto} ${styles.collageThree}`}
              />
            </div>
          </div>
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
            From hello to heirloom, in three easy steps.
          </h2>
          <div className={styles.infoGrid}>
            <article className={styles.infoItem}>
              <div className={styles.infoTop}>
                <span className={`${styles.featureIcon} ${styles.iconEmber}`}>
                  <Mic aria-hidden="true" />
                </span>
                <span className={styles.infoNumber}>01</span>
              </div>
              <h3>Talk naturally</h3>
              <p>
                The AI host asks gentle questions and lets the storyteller
                answer in their own voice.
              </p>
            </article>
            <article className={styles.infoItem}>
              <div className={styles.infoTop}>
                <span className={`${styles.featureIcon} ${styles.iconAmber}`}>
                  <Sparkles aria-hidden="true" />
                </span>
                <span className={styles.infoNumber}>02</span>
              </div>
              <h3>Shape the memory</h3>
              <p>
                Each conversation becomes a polished private episode, ready for
                review before anyone else hears it.
              </p>
            </article>
            <article className={styles.infoItem}>
              <div className={styles.infoTop}>
                <span className={`${styles.featureIcon} ${styles.iconSage}`}>
                  <Users aria-hidden="true" />
                </span>
                <span className={styles.infoNumber}>03</span>
              </div>
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
