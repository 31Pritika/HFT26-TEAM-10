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
    violet: "bg-primary/10 text-primary border border-primary/30",
    critical: "bg-critical/10 text-text border border-critical/40",
    high: "bg-high/10 text-text border border-high/40",
    medium: "bg-medium/10 text-text border border-medium/40",
    low: "bg-low/10 text-text border border-low/40",
    info: "bg-info/10 text-text border border-info/40",
    outline: "border border-border text-muted bg-transparent",
    mono: " bg-surface-solid text-primary border border-border",
  };

  const dotStyles = {
    default: "bg-muted",
    cyan: "bg-primary",
    violet: "bg-primary",
    critical: "bg-critical",
    high: "bg-high",
    medium: "bg-medium",
    low: "bg-low",
    info: "bg-info",
    outline: "bg-muted",
    mono: "bg-primary",
  };

  const sizeStyles = {
    xs: "px-1.5 py-0.5 text-[11px] gap-1",
    sm: "px-2.5 py-0.5 text-xs gap-1.5",
    md: "px-3 py-1 text-sm gap-2",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-sm transition-colors whitespace-nowrap",
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

