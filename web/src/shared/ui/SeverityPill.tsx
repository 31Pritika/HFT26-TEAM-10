import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Severity } from "../types";
import { SEVERITY_META } from "./severity";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface SeverityPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  severity: Severity;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
  pulse?: boolean;
  className?: string;
}

export function SeverityPill({
  severity,
  size = "sm",
  showIcon = true,
  pulse: _pulse = true,
  className,
  ...props
}: SeverityPillProps) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.info;
  const Icon = meta.icon;

  const sizeStyles = {
    xs: "text-[11px] px-1.5 py-0.5 gap-1",
    sm: "text-xs px-2 py-0.5 gap-1.5",
    md: "text-sm px-2.5 py-1 gap-2",
  };

  const iconSizes = {
    xs: "w-3 h-3 shrink-0",
    sm: "w-3.5 h-3.5 shrink-0",
    md: "w-4 h-4 shrink-0",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border font-medium text-text whitespace-nowrap select-none",
        sizeStyles[size],
        meta.pillClass,
        className,
      )}
      {...props}
    >
      {showIcon && <Icon className={cn(iconSizes[size], meta.iconClass)} />}
      <span>{meta.label}</span>
    </span>
  );
}
