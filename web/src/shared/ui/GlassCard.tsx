import type { ReactNode } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "default" | "solid" | "glow" | "critical" | "neon";
  glow?: "none" | "cyan" | "violet" | "critical";
  interactive?: boolean;
  className?: string;
}

/**
 * Restyled to Stage Light flat surface:
 * Solid #111111 background with 1px hairline border (no glassmorphism, no backdrop-blur).
 */
export function GlassCard({
  children,
  variant = "default",
  glow: _glow = "none",
  interactive = false,
  className,
  ...props
}: GlassCardProps) {
  const variantStyles = {
    default: "bg-surface border-border",
    solid: "bg-surface-solid border-border",
    glow: "bg-surface border-border hover:border-primary/40",
    critical: "bg-surface border-critical/30",
    neon: "bg-surface border-border",
  };

  return (
    <div
      className={cn(
        "relative rounded-[var(--radius)] border p-5 transition-colors duration-150",
        variantStyles[variant],
        interactive && "cursor-pointer hover:border-border-strong hover:bg-surface-solid",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
