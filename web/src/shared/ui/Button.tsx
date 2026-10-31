import React from "react";
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
      magnetic: _magnetic = false,
      loading = false,
      disabled,
      className,
      ...props
    },
    ref,
  ) => {
    const variantStyles = {
      primary: "bg-primary text-[#0b0d13] font-semibold border border-primary hover:bg-[#d8e8f7]",
      secondary: "bg-transparent border border-border-strong text-text hover:border-primary hover:text-primary",
      danger: "bg-transparent border border-red-500/50 text-red-400 hover:bg-red-500/10",
      ghost: "bg-transparent border border-transparent text-muted hover:text-text hover:border-border",
      outline: "bg-transparent border border-border text-muted hover:border-primary hover:text-primary",
      glow: "bg-transparent border border-primary/60 text-primary hover:bg-primary/10",
    };

    const sizeStyles = {
      xs: "px-2.5 py-1 text-[11px] gap-1.5",
      sm: "px-3 py-1.5 text-xs gap-2",
      md: "px-4 py-2 text-xs gap-2",
      lg: "px-5 py-2.5 text-sm gap-2.5",
      icon: "w-9 h-9 p-0 justify-center",
    };

    return (
      <motion.button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-sm font-mono font-medium select-none cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
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

