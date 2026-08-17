import { HeroSky } from "@/components/hero-sky";
import styles from "@/components/portal-shell.module.css";

export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.root} data-portal-theme>
      <HeroSky
        key="portal-shader-v1"
        shaderRevision="magenta-violet-portal-shader-v2"
        className={styles.sky}
      />
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.frame} data-portal-frame>{children}</div>
    </div>
  );
}

export { styles as portalStyles };
