import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { GlassCard } from "./GlassCard";
import { CountUp } from "./CountUp";
import { Sparkline } from "./Sparkline";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface StatProps {
  label: string;
  value: number | string;
  sublabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: {
    value: number | string;
    direction?: "up" | "down" | "flat";
    isUpGood?: boolean;
  };
  sparkline?: number[];
  sparklineColor?: string;
  countUp?: boolean;
  formatter?: (val: number) => string;
  variant?: "default" | "critical" | "cyan" | "violet" | "warning";
  className?: string;
}

export function Stat({
  label,
  value,
  sublabel,
  icon: Icon,
  trend,
  sparkline,
  sparklineColor = "#bad6f7",
  countUp = true,
  formatter,
  variant = "default",
  className,
}: StatProps) {
  const isNumeric = typeof value === "number";

  const iconVariants = {
    default: "bg-surface-solid text-muted border border-border",
    cyan: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 ",
    violet: "bg-violet-500/10 text-violet-400 border border-violet-500/20 ",
    critical: "bg-red-500/15 text-[#df6a68] border border-red-500/30 ",
    warning: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
  };

  const trendPositive = trend?.direction === "up" ? trend.isUpGood !== false : trend?.isUpGood === false;

  return (
    <GlassCard
      variant="default"
      className={cn(
        "p-4 flex flex-col justify-between transition-all duration-200 hover:border-white/20",
        variant === "critical" && "border-red-500/25 bg-red-950/10",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted line-clamp-1">{label}</span>
        {Icon && (
          <div className={cn("p-1.5 rounded-lg shrink-0", iconVariants[variant])}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="my-2 flex items-baseline justify-between gap-2">
        <div className="font-mono text-2xl font-bold tracking-tight text-text">
          {isNumeric && countUp ? (
            <CountUp value={value as number} formatter={formatter} />
          ) : (
            <span>{value}</span>
          )}
        </div>

        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} color={sparklineColor} height={26} width={70} />
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        {sublabel && <span className="line-clamp-1">{sublabel}</span>}
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono text-[11px] font-medium shrink-0 ml-auto",
              trendPositive ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {trend.direction === "up" ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : trend.direction === "down" ? (
              <ArrowDownRight className="w-3 h-3" />
            ) : null}
            {trend.value}
          </span>
        )}
      </div>
    </GlassCard>
  );
}

