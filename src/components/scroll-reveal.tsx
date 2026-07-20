"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import styles from "./scroll-reveal.module.css";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
};

export function ScrollReveal({
  children,
  className,
  delay = 0,
  distance = 28,
}: ScrollRevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState<boolean | null>(null);

  useEffect(() => {
    const element = elementRef.current;

    if (!element) {
      return;
    }

    let intervalId: number | null = null;

    const stopWatching = () => {
      window.removeEventListener("scroll", checkPosition);
      window.removeEventListener("resize", checkPosition);

      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const checkPosition = () => {
      const bounds = element.getBoundingClientRect();
      const revealLine = window.innerHeight * 0.92;

      if (bounds.top < revealLine && bounds.bottom > 0) {
        setIsVisible(true);
        stopWatching();
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", checkPosition, { passive: true });
    window.addEventListener("resize", checkPosition);
    intervalId = window.setInterval(checkPosition, 250);
    checkPosition();

    return stopWatching;
  }, []);

  const revealStyle = {
    "--reveal-delay": `${delay}s`,
    "--reveal-distance": `${distance}px`,
  } as CSSProperties;

  return (
    <div
      ref={elementRef}
      className={`${className ?? ""} ${styles.reveal} ${
        isVisible === false ? styles.hidden : ""
      } ${isVisible === true ? styles.visible : ""}`}
      style={revealStyle}
    >
      {children}
    </div>
  );
}
