import React from "react";
import { ShieldAlert, AlertTriangle, AlertCircle, ShieldCheck, Info } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Severity } from "../types";

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

const CONFIG: Record<
  Severity,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    pillClass: string;
    iconClass: string;
    pulseClass?: string;
  }
> = {
  critical: {
    label: "CRITICAL",
    icon: ShieldAlert,
    pillClass: "bg-red-500/15 text-[#df6a68] border-red-500/40 ",
    iconClass: "text-[#df6a68]",
    pulseClass: "",
  },
  high: {
    label: "HIGH",
    icon: AlertTriangle,
    pillClass: "bg-orange-500/15 text-[#d4915a] border-orange-500/35",
    iconClass: "text-[#d4915a]",
  },
  medium: {
    label: "MEDIUM",
    icon: AlertCircle,
    pillClass: "bg-amber-500/15 text-[#c9b467] border-amber-500/35",
    iconClass: "text-[#c9b467]",
  },
  low: {
    label: "LOW",
    icon: ShieldCheck,
    pillClass: "bg-emerald-500/15 text-[#86b69a] border-emerald-500/35",
    iconClass: "text-[#86b69a]",
  },
  info: {
    label: "INFO",
    icon: Info,
    pillClass: "bg-blue-500/15 text-[#8fb0d8] border-blue-500/35",
    iconClass: "text-[#8fb0d8]",
  },
};

export function SeverityPill({
  severity,
  size = "sm",
  showIcon = true,
  pulse = true,
  className,
  ...props
}: SeverityPillProps) {
  const meta = CONFIG[severity] ?? CONFIG.info;
  const Icon = meta.icon;

  const sizeStyles = {
    xs: "text-[10px] px-1.5 py-0.5 gap-1 font-mono  font-semibold",
    sm: "text-xs px-2.5 py-1 gap-1.5 font-mono  font-semibold",
    md: "text-sm px-3 py-1.5 gap-2 font-mono  font-semibold",
  };

  const iconSizes = {
    xs: "w-3 h-3 shrink-0",
    sm: "w-3.5 h-3.5 shrink-0",
    md: "w-4 h-4 shrink-0",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border  whitespace-nowrap transition-all select-none",
        sizeStyles[size],
        meta.pillClass,
        severity === "critical" && pulse && meta.pulseClass,
        className,
      )}
      {...props}
    >
      {showIcon && <Icon className={cn(iconSizes[size], meta.iconClass)} />}
      <span>{meta.label}</span>
    </span>
  );
}

