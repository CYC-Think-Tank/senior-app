"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEventHandler } from "react";
import { useRef } from "react";

type Props = Omit<ComponentProps<typeof Link>, "href" | "onClick"> & {
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function PageTransitionLink({ href, onClick, ...props }: Props) {
  const router = useRouter();
  const navigating = useRef(false);

  function handleClick(event: Parameters<MouseEventHandler<HTMLAnchorElement>>[0]) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.currentTarget.target === "_blank" ||
      navigating.current
    ) {
      return;
    }

    event.preventDefault();
    navigating.current = true;
    document.documentElement.dataset.pageTransition = "true";

    window.setTimeout(() => {
      router.push(href);
    }, 260);
  }

  return <Link href={href} {...props} onClick={handleClick} />;
}
