"use client";

import { usePathname } from "next/navigation";
import theme from "./interview-theme.module.css";

export function InterviewAtmosphere() {
  const pathname = usePathname();

  if (!pathname?.startsWith("/interview")) {
    return null;
  }

  return <div className={theme.atmosphere} aria-hidden="true" />;
}
