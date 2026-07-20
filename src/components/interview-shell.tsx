"use client";

import { useEffect } from "react";
import theme from "./interview-theme.module.css";

export function InterviewShell({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.documentElement.removeAttribute("data-page-transition");
    document.documentElement.removeAttribute("data-page-elements-leaving");
  }, []);

  return (
    <main className={theme.shell}>
      <div className={theme.content}>{children}</div>
    </main>
  );
}
