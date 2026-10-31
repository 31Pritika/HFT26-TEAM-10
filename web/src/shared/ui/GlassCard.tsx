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

/** A flat hairline panel with corner marks. `variant` and `glow` only pick the border now. */
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
        "crop rounded-sm border bg-surface p-5 transition-colors duration-150",
        critical ? "border-red-500/35" : "border-border",
        interactive && "cursor-pointer hover:border-border-strong",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
