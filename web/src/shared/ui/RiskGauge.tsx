import { motion } from "motion/react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RiskGrade } from "../types";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface RiskGaugeProps {
  score: number;
  grade?: RiskGrade;
  size?: "hero" | "lg" | "md" | "sm" | "compact";
  showLabel?: boolean;
  className?: string;
}

export function getRiskGrade(score: number): RiskGrade {
  if (score <= 20) return "A";
  if (score <= 40) return "B";
  if (score <= 60) return "C";
  if (score <= 80) return "D";
  return "F";
}

const GRADE_CONFIG: Record<
  RiskGrade,
  {
    color: string;
    textClass: string;
    statusLabel: string;
  }
> = {
  A: {
    color: "#4CAF7A",
    textClass: "text-[#4CAF7A]",
    statusLabel: "HEALTHY POSTURE",
  },
  B: {
    color: "#7A9CC6",
    textClass: "text-[#7A9CC6]",
    statusLabel: "MODERATE RISK",
  },
  C: {
    color: "#D9B44A",
    textClass: "text-[#D9B44A]",
    statusLabel: "ELEVATED EXPOSURE",
  },
  D: {
    color: "#E8833A",
    textClass: "text-[#E8833A]",
    statusLabel: "HIGH RISK LEVEL",
  },
  F: {
    color: "#E5484D",
    textClass: "text-[#E5484D]",
    statusLabel: "CRITICAL BREACH HAZARD",
  },
};

export function RiskGauge({
  score,
  grade: customGrade,
  size = "hero",
  showLabel = true,
  className,
}: RiskGaugeProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const grade = customGrade ?? getRiskGrade(clampedScore);
  const cfg = GRADE_CONFIG[grade];

  const dimensions = {
    hero: { diameter: 220, stroke: 14, fontGrade: "text-6xl", fontScore: "text-base" },
    lg: { diameter: 160, stroke: 12, fontGrade: "text-4xl", fontScore: "text-sm" },
    md: { diameter: 120, stroke: 10, fontGrade: "text-3xl", fontScore: "text-xs" },
    sm: { diameter: 80, stroke: 7, fontGrade: "text-xl", fontScore: "text-[10px]" },
    compact: { diameter: 48, stroke: 4.5, fontGrade: "text-sm", fontScore: "text-[9px]" },
  }[size];

  const radius = (dimensions.diameter - dimensions.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (clampedScore / 100) * arcLength;
  const startAngle = 135;

  const center = dimensions.diameter / 2;

  return (
    <div className={cn("relative flex flex-col items-center justify-center select-none", className)}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: dimensions.diameter, height: dimensions.diameter }}
      >
        <svg
          width={dimensions.diameter}
          height={dimensions.diameter}
          viewBox={`0 0 ${dimensions.diameter} ${dimensions.diameter}`}
          className="overflow-visible -rotate-90 transform"
        >
          {/* Background Track Arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={dimensions.stroke}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            style={{
              transformOrigin: "center",
              transform: `rotate(${startAngle}deg)`,
            }}
          />

          {/* Active Animated Meter Arc */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={cfg.color}
            strokeWidth={dimensions.stroke}
            strokeDasharray={`${arcLength} ${circumference}`}
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
            strokeLinecap="round"
            style={{
              transformOrigin: "center",
              transform: `rotate(${startAngle}deg)`,
            }}
          />
        </svg>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <motion.span
            key={grade}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={cn("font-display font-medium leading-none tracking-tight", dimensions.fontGrade, cfg.textClass)}
          >
            {grade}
          </motion.span>
          <span className={cn("font-mono font-medium text-muted mt-1 leading-none", dimensions.fontScore)}>
            {clampedScore}
            <span className="text-muted/50 text-[0.8em]">/100</span>
          </span>
        </div>
      </div>

      {showLabel && size === "hero" && (
        <div className="mt-3 text-center">
          <span
            className={cn(
              "inline-block font-mono text-xs font-medium tracking-wider uppercase px-3 py-1 rounded-[var(--radius)] border bg-surface",
              cfg.textClass,
              "border-current/30",
            )}
          >
            {cfg.statusLabel}
          </span>
        </div>
      )}
    </div>
  );
}
