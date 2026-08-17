"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useI18n } from "@/components/i18n-provider";
import theme from "./interview-theme.module.css";

export function InterviewShell({
  children,
  homeHref,
}: {
  children: React.ReactNode;
  homeHref?: string;
}) {
  const { locale, t } = useI18n();

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
          aria-label={t("landingHomeAria")}
        >
          {locale === "en" ? "WiseShare" : "仁慧享"}
        </Link>
      ) : null}
      <div className={theme.content}>{children}</div>
    </main>
  );
}
