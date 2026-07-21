import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export function Wordmark({
  tone = "ink",
}: {
  tone?: "ink" | "light";
}) {
  return (
    <Link
      href="/"
      className={`font-serif text-2xl font-semibold tracking-tight ${
        tone === "light" ? "text-cream" : "text-ink"
      }`}
    >
      {APP_NAME}
      <span className={tone === "light" ? "text-[#ffd19c]" : "text-ember"}>
        .
      </span>
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
      className={`portal-card rounded-xl border border-line bg-cream/95 shadow-[0_1px_3px_rgba(42,32,24,0.05)] transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out ${className}`}
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
    "portal-button-primary inline-flex items-center justify-center gap-2 rounded-lg bg-ember px-5 py-2.5 font-medium text-cream transition-[background-color,color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:bg-ember-deep disabled:opacity-50 disabled:pointer-events-none",
  secondary:
    "portal-button-secondary inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-cream px-5 py-2.5 font-medium text-ink transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:bg-paper-deep disabled:opacity-50 disabled:pointer-events-none",
  ghost:
    "portal-button-ghost inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium text-ink-soft transition-[background-color,color,transform] duration-200 ease-out hover:-translate-y-px hover:bg-paper-deep hover:text-ink disabled:opacity-50 disabled:pointer-events-none",
};

export const inputStyles =
  "portal-input w-full rounded-lg border border-line bg-cream px-4 py-2.5 text-ink placeholder:text-ink-faint focus:border-ember focus:outline-none";

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
      className={`portal-monogram flex items-center justify-center rounded-lg border border-ember/10 bg-ember-soft font-serif font-semibold text-ember-deep ${sizes[size]}`}
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
