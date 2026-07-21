import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="font-serif text-2xl font-semibold tracking-tight text-ink"
    >
      {APP_NAME}
      <span className="text-ember">.</span>
    </Link>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-cream shadow-[0_1px_3px_rgba(42,32,24,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ember" | "sage";
}) {
  const tones = {
    neutral: "bg-paper-deep text-ink-soft",
    ember: "bg-ember-soft text-ember-deep",
    sage: "bg-sage-soft text-sage",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export const buttonStyles = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-ember px-5 py-2.5 font-medium text-cream transition-colors hover:bg-ember-deep disabled:opacity-50 disabled:pointer-events-none",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-cream px-5 py-2.5 font-medium text-ink transition-colors hover:bg-paper-deep disabled:opacity-50 disabled:pointer-events-none",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-medium text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink disabled:opacity-50 disabled:pointer-events-none",
};

export const inputStyles =
  "w-full rounded-xl border border-line bg-cream px-4 py-2.5 text-ink placeholder:text-ink-faint focus:border-ember focus:outline-none";

export function Monogram({
  name,
  size = "md",
}: {
  name: string;
  size?: "md" | "lg";
}) {
  const sizes = {
    md: "h-12 w-12 text-xl",
    lg: "h-20 w-20 text-3xl",
  };
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-ember-soft font-serif font-semibold text-ember-deep ${sizes[size]}`}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

export function formatDuration(ms: number | null | undefined) {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatTimestamp(ms: number) {
  // Streamed WebM reports a non-finite duration until it's fully seeked.
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
