"use client";

import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const liquidButtonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold outline-none transition-[color,box-shadow,transform,filter] duration-300 focus-visible:ring-3 focus-visible:ring-white/35 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-transparent text-white hover:scale-105 active:scale-[0.98]",
        dark: "bg-transparent text-ink hover:scale-105 active:scale-[0.98]",
      },
      size: {
        sm: "h-11 px-5",
        default: "h-12 px-7",
        lg: "h-14 px-9 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type LiquidButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof liquidButtonVariants> & {
    asChild?: boolean;
  };

function LiquidButton({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: LiquidButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(
        "relative isolate overflow-hidden",
        liquidButtonVariants({ variant, size, className })
      )}
      {...props}
    >
      <span
        className="absolute inset-0 z-0 rounded-full shadow-[0_0_6px_rgba(255,255,255,0.08),0_2px_10px_rgba(0,0,0,0.18),inset_3px_3px_0.5px_-3px_rgba(255,255,255,0.8),inset_-3px_-3px_0.5px_-3px_rgba(255,255,255,0.55),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.65),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.45),inset_0_0_8px_6px_rgba(255,255,255,0.11),0_0_18px_rgba(255,255,255,0.16)] transition-all"
        aria-hidden="true"
      />
      <span
        className="absolute inset-0 -z-10 rounded-full bg-white/10 backdrop-blur-md"
        style={{ backdropFilter: 'url("#container-glass") blur(14px)' }}
        aria-hidden="true"
      />
      <span
        className="absolute inset-px z-0 rounded-full bg-gradient-to-b from-white/28 via-white/10 to-white/6"
        aria-hidden="true"
      />
      <Slottable>{children}</Slottable>
      <GlassFilter />
    </Comp>
  );
}

function GlassFilter() {
  return (
    <svg className="hidden" aria-hidden="true">
      <defs>
        <filter
          id="container-glass"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.05"
            numOctaves="1"
            seed="1"
            result="turbulence"
          />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            scale="70"
            xChannelSelector="R"
            yChannelSelector="B"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

export { LiquidButton, liquidButtonVariants };
