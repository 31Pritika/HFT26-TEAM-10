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

/** A flat panel with a thin border. `variant` and `glow` only pick the border now. */
export function GlassCard({
  children,
  variant = "default",
  glow = "none",
  interactive = false,
  className,
  ...props
}: GlassCardProps) {
  const critical = variant === "critical" || glow === "critical";

  return (
    <motion.div
      className={cn(
        "rounded-md border bg-surface p-5 transition-colors",
        critical ? "border-critical/40" : "border-border",
        interactive && "cursor-pointer hover:border-border-strong hover:bg-elevated",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
