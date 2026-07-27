"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { useI18n } from "@/components/i18n-provider";

export function UserMenu({
  name,
  tone = "light",
}: {
  name: string;
  tone?: "light" | "dark";
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
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

  useLayoutEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const trigger = ref.current?.querySelector("button");
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuWidth = Math.min(160, window.innerWidth - 32);
      const menuHeight = 48;
      const left = Math.min(
        Math.max(16, triggerRect.right - menuWidth),
        window.innerWidth - menuWidth - 16,
      );
      const belowTop = triggerRect.bottom + 4;
      const top =
        belowTop + menuHeight <= window.innerHeight
          ? belowTop
          : Math.max(16, triggerRect.top - menuHeight - 4);

      setMenuPosition({ left, top });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex max-w-[12rem] items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow,transform] ${
          tone === "dark"
            ? "text-cream/80 hover:-translate-y-px hover:text-white"
            : "text-ink hover:bg-paper-deep"
        }`}
      >
        <span className="truncate">{name}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${
            tone === "dark" ? "text-cream/65" : "text-ink-soft"
          } ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && menuPosition && (
        <div
          role="menu"
          style={menuPosition}
          className="fixed z-20 min-w-[10rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-cream py-1 shadow-md"
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
