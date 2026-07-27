"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import theme from "./interview-theme.module.css";

export function InterviewShell({
  children,
  homeHref,
}: {
  children: React.ReactNode;
  homeHref?: string;
}) {
  useEffect(() => {
    document.documentElement.removeAttribute("data-page-transition");
    document.documentElement.removeAttribute("data-page-elements-leaving");
  }, []);

  return (
    <main className={theme.shell}>
      {homeHref ? (
        <Link
          href={homeHref}
          className={theme.homeLink}
          aria-label="Fireside home"
        >
          <Image
            src="/firesidelogo.png"
            alt=""
            width={48}
            height={48}
            className={theme.homeLogo}
          />
        </Link>
      ) : null}
      <div className={theme.content}>{children}</div>
    </main>
  );
}
