import React, { type ReactNode } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: "default" | "cyan" | "violet" | "critical" | "high" | "medium" | "low" | "info" | "outline" | "mono";
  size?: "xs" | "sm" | "md";
  dot?: boolean;
  className?: string;
}

export function Badge({
  children,
  variant = "default",
  size = "sm",
  dot = false,
  className,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "bg-surface-solid text-muted border border-border",
    cyan: "bg-primary/10 text-primary border border-primary/30",
    violet: "bg-surface text-text border border-border",
    critical: "bg-critical/10 text-critical border border-critical/30",
    high: "bg-high/10 text-high border border-high/30",
    medium: "bg-medium/10 text-medium border border-medium/30",
    low: "bg-low/10 text-low border border-low/30",
    info: "bg-info/10 text-info border border-info/30",
    outline: "border border-border text-muted bg-transparent",
    mono: "font-mono bg-surface text-primary border border-primary/30",
  };

  const dotStyles = {
    default: "bg-muted",
    cyan: "bg-primary",
    violet: "bg-muted",
    critical: "bg-critical",
    high: "bg-high",
    medium: "bg-medium",
    low: "bg-low",
    info: "bg-info",
    outline: "bg-muted",
    mono: "bg-primary",
  };

  const sizeStyles = {
    xs: "px-1.5 py-0.5 text-[10px] gap-1",
    sm: "px-2 py-0.5 text-xs gap-1.5",
    md: "px-2.5 py-1 text-sm gap-2",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-[var(--radius-sm)] transition-colors whitespace-nowrap",
        sizeStyles[size],
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", dotStyles[variant])} />}
      {children}
    </span>
  );
}
