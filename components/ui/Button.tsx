"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "win" | "danger";
type Size    = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Wrap in a blurred glow ring (primary/win only) */
  glow?: boolean;
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: "py-2 px-4 text-[9px] tracking-[0.2em] min-h-[36px]",
  md: "py-3 px-5 text-[10px] tracking-[0.22em] min-h-[44px]",
  lg: "py-3.5 px-6 text-[11px] tracking-[0.28em] min-h-[52px]",
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white shine-sweep",
  secondary: "bg-[var(--surface-1)] hover:bg-[var(--surface-2)] ring-1 ring-[var(--ring-1)] text-white",
  ghost: "bg-transparent hover:bg-[var(--surface-1)] text-white/55 hover:text-white/80",
  win: "bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black shine-sweep",
  danger: "bg-rose-500/15 ring-1 ring-rose-400/30 text-rose-300 hover:bg-rose-500/25",
};

const GLOW_COLORS: Partial<Record<Variant, string>> = {
  primary: "linear-gradient(135deg, rgba(34,211,238,0.5), rgba(6,182,212,0.3), rgba(34,211,238,0.5))",
  win:     "linear-gradient(135deg, rgba(251,191,36,0.5), rgba(245,158,11,0.3), rgba(251,191,36,0.5))",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", glow, className = "", children, disabled, ...props }, ref) => {
    const btn = (
      <button
        ref={ref}
        disabled={disabled}
        {...props}
        className={[
          "relative w-full rounded-[var(--radius-input)] font-mono font-bold uppercase",
          "transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed",
          "overflow-hidden",
          SIZE_CLASSES[size],
          VARIANT_CLASSES[variant],
          className,
        ].join(" ")}
      >
        {children}
      </button>
    );

    const showGlow = (glow ?? (variant === "primary" || variant === "win")) && !disabled;
    if (showGlow && GLOW_COLORS[variant]) {
      return (
        <div className="relative group">
          <div
            className="absolute -inset-[1px] rounded-[var(--radius-input)] opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ background: GLOW_COLORS[variant], filter: "blur(6px)" }}
          />
          {btn}
        </div>
      );
    }
    return btn;
  },
);

Button.displayName = "Button";
