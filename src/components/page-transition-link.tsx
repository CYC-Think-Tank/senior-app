"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export function PageTransitionLink(props: Props) {
  return <Link {...props} />;
}
