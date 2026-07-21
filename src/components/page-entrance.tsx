"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PageEntrance({ children }: { children: ReactNode }) {
  return <div data-page-entrance className="contents">{children}</div>;
}

/** Keeps shared layouts mounted while replaying the entrance only for the
 * route content that changed. */
export function RouteContentEntrance({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} data-page-content className="contents">
      {children}
    </div>
  );
}
