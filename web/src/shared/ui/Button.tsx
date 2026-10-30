import React, { useRef, useState } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline" | "glow";
  size?: "xs" | "sm" | "md" | "lg" | "icon";
  magnetic?: boolean;
  loading?: boolean;
  className?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "secondary",
      size = "md",
      magnetic = false,
      loading = false,
      disabled,
      className,
      onMouseMove,
      onMouseLeave,
      ...props
    },
    ref,
  ) => {
    const internalRef = useRef<HTMLButtonElement | null>(null);
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (magnetic && !disabled && !loading) {
        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const pullFactor = 0.25;
        const maxOffset = 6;
        const x = Math.max(-maxOffset, Math.min(maxOffset, (e.clientX - centerX) * pullFactor));
        const y = Math.max(-maxOffset, Math.min(maxOffset, (e.clientY - centerY) * pullFactor));
        setOffset({ x, y });
      }
      onMouseMove?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (magnetic) {
        setOffset({ x: 0, y: 0 });
      }
      onMouseLeave?.(e);
    };

    const variantStyles = {
      primary:
        "bg-gradient-to-r from-[#22d3ee] to-[#0ea5e9] text-black font-semibold shadow-[0_0_20px_rgba(34,211,238,0.35)] hover:shadow-[0_0_28px_rgba(34,211,238,0.55)] border border-cyan-300/40 active:scale-[0.98]",
      secondary:
        "bg-surface-solid/80 hover:bg-surface border border-white/10 hover:border-white/20 text-text active:scale-[0.98]",
      danger:
        "bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-[#ff3b5c] hover:shadow-[0_0_20px_rgba(255,59,92,0.3)] active:scale-[0.98]",
      ghost:
        "bg-transparent hover:bg-white/[0.05] text-muted hover:text-text border border-transparent active:scale-[0.98]",
      outline:
        "bg-transparent border border-border hover:border-primary/50 text-muted hover:text-primary active:scale-[0.98]",
      glow:
        "bg-[#111627] border border-cyan-500/40 text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.25)] hover:shadow-[0_0_24px_rgba(34,211,238,0.4)] active:scale-[0.98]",
    };

    const sizeStyles = {
      xs: "px-2.5 py-1 text-xs rounded-md gap-1.5",
      sm: "px-3 py-1.5 text-xs rounded-lg gap-2",
      md: "px-4 py-2 text-sm rounded-lg gap-2",
      lg: "px-6 py-2.5 text-base rounded-xl gap-2.5",
      icon: "w-9 h-9 p-0 rounded-lg justify-center",
    };

    return (
      <motion.button
        ref={(node) => {
          internalRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        disabled={disabled || loading}
        animate={{ x: offset.x, y: offset.y }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "inline-flex items-center justify-center font-medium select-none cursor-pointer transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary",
          sizeStyles[size],
          variantStyles[variant],
          className,
        )}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
        {children}
      </motion.button>
    );
  },
);

Button.displayName = "Button";
