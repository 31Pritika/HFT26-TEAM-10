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
    cyan: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30",
    violet: "bg-violet-500/10 text-violet-300 border border-violet-500/30",
    critical: "bg-red-500/10 text-red-400 border border-red-500/30",
    high: "bg-orange-500/10 text-orange-400 border border-orange-500/30",
    medium: "bg-amber-500/10 text-amber-300 border border-amber-500/30",
    low: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
    info: "bg-blue-500/10 text-blue-300 border border-blue-500/30",
    outline: "border border-border text-muted bg-transparent",
    mono: "font-mono bg-[#0c101d] text-cyan-400/90 border border-cyan-900/40",
  };

  const dotStyles = {
    default: "bg-muted",
    cyan: "bg-cyan-400 animate-pulse",
    violet: "bg-violet-400 animate-pulse",
    critical: "bg-red-400 animate-ping",
    high: "bg-orange-400 animate-pulse",
    medium: "bg-amber-400",
    low: "bg-emerald-400",
    info: "bg-blue-400",
    outline: "bg-muted",
    mono: "bg-cyan-400",
  };

  const sizeStyles = {
    xs: "px-1.5 py-0.5 text-[10px] gap-1",
    sm: "px-2.5 py-0.5 text-xs gap-1.5",
    md: "px-3 py-1 text-sm gap-2",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full transition-colors whitespace-nowrap",
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
