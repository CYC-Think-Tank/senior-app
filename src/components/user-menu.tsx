"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { useI18n } from "@/components/i18n-provider";

export function UserMenu({ name }: { name: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper-deep"
      >
        <span className="truncate">{name}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-soft transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-line bg-cream py-1 shadow-md"
        >
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink"
            >
              <LogOut className="h-4 w-4" /> {t("commonSignOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
