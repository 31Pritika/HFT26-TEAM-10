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
      primary: "bg-cta text-on-cta font-medium border border-cta hover:bg-cta-hover hover:border-cta-hover",
      secondary: "bg-transparent border border-border text-text hover:bg-elevated hover:border-border-strong",
      danger: "bg-transparent border border-critical/50 text-critical hover:bg-critical/10 hover:border-critical",
      ghost: "bg-transparent border border-transparent text-muted hover:text-text hover:bg-elevated",
      outline: "bg-transparent border border-border text-muted hover:text-text hover:bg-elevated hover:border-border-strong",
      glow: "bg-transparent border border-border text-primary hover:bg-elevated hover:border-border-strong",
    };

    const sizeStyles = {
      xs: "px-2.5 py-1 text-xs gap-1.5",
      sm: "px-3 py-1.5 text-[13px] gap-2",
      md: "px-4 py-2 text-[13px] gap-2",
      lg: "px-5 py-2.5 text-sm gap-2.5",
      icon: "w-9 h-9 p-0 justify-center",
    };

    return (
      <motion.button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium select-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
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

