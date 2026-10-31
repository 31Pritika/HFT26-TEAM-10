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
    glowClass: string;
    textClass: string;
    statusLabel: string;
  }
> = {
  A: {
    color: "#86b69a",
    glowClass: "",
    textClass: "text-[#86b69a]",
    statusLabel: "posture: healthy",
  },
  B: {
    color: "#bad6f7",
    glowClass: "",
    textClass: "text-[#bad6f7]",
    statusLabel: "posture: moderate",
  },
  C: {
    color: "#c9b467",
    glowClass: "",
    textClass: "text-[#c9b467]",
    statusLabel: "posture: elevated",
  },
  D: {
    color: "#d4915a",
    glowClass: "",
    textClass: "text-[#d4915a]",
    statusLabel: "posture: high",
  },
  F: {
    color: "#df6a68",
    glowClass: "",
    textClass: "text-[#df6a68]",
    statusLabel: "posture: critical",
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
    hero: { diameter: 208, stroke: 6, fontGrade: "text-6xl", fontScore: "text-base" },
    lg: { diameter: 160, stroke: 5, fontGrade: "text-4xl", fontScore: "text-sm" },
    md: { diameter: 120, stroke: 4, fontGrade: "text-3xl", fontScore: "text-xs" },
    sm: { diameter: 80, stroke: 3, fontGrade: "text-xl", fontScore: "text-[10px]" },
    compact: { diameter: 44, stroke: 3, fontGrade: "text-sm", fontScore: "text-[9px]" },
  }[size];

  const radius = (dimensions.diameter - dimensions.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Arc angle: 260 degrees instead of full 360 for a command-meter aesthetic
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (clampedScore / 100) * arcLength;
  const startAngle = 135; // degrees

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
            strokeLinecap="butt"
            style={{
              transformOrigin: "center",
              transform: `rotate(${startAngle}deg)`,
            }}
          />

          {/* Active Animated Gradient Meter Arc */}
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
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            strokeLinecap="butt"
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
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={cn("font-display font-bold leading-none tracking-tight", dimensions.fontGrade, cfg.textClass)}
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
              "inline-block font-mono text-[11px] font-medium px-2 py-0.5 rounded-sm border bg-surface-solid/80 ",
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
