import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  variant?: "default" | "solid" | "glow" | "critical" | "neon";
  glow?: "none" | "cyan" | "violet" | "critical";
  interactive?: boolean;
  className?: string;
}

export function GlassCard({
  children,
  variant = "default",
  glow = "none",
  interactive = false,
  className,
  ...props
}: GlassCardProps) {
  const glowStyles = {
    none: "",
    cyan: "shadow-[0_0_24px_rgba(34,211,238,0.2)] border-cyan-500/30",
    violet: "shadow-[0_0_24px_rgba(139,92,246,0.25)] border-violet-500/30",
    critical: "shadow-[0_0_28px_rgba(255,59,92,0.3)] border-red-500/30",
  };

  const variantStyles = {
    default: "bg-surface/80 border-white/[0.08] backdrop-blur-xl",
    solid: "bg-surface-solid border-border-strong",
    glow: "bg-surface/90 border-cyan-500/30 shadow-[0_0_24px_rgba(34,211,238,0.15)] backdrop-blur-xl",
    critical: "bg-surface/90 border-red-500/30 shadow-[0_0_28px_rgba(255,59,92,0.2)] backdrop-blur-xl",
    neon: "bg-[#090d19]/90 border-cyan-400/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-2xl",
  };

  return (
    <motion.div
      whileHover={interactive ? { y: -2, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } } : undefined}
      className={cn(
        "relative rounded-xl border p-5 transition-colors duration-200",
        variantStyles[variant],
        glowStyles[glow],
        interactive && "cursor-pointer hover:border-white/20 hover:bg-surface/95",
        className,
      )}
      {...props}
    >
      {/* Subtle top specular hairline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent rounded-t-xl" />
      {children}
    </motion.div>
  );
}
