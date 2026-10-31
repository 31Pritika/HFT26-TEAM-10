import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline" | "glow";
  size?: "xs" | "sm" | "md" | "lg" | "icon";
  loading?: boolean;
  magnetic?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "secondary",
      size = "md",
      loading = false,
      disabled,
      magnetic: _magnetic,
      className,
      ...props
    },
    ref,
  ) => {
    const variantStyles = {
      primary:
        "bg-primary text-primary-ink font-semibold border border-transparent hover:bg-primary/90",
      secondary:
        "bg-surface hover:bg-surface-solid border border-border hover:border-border-strong text-text",
      danger:
        "bg-critical/15 hover:bg-critical/25 border border-critical/30 text-critical",
      ghost:
        "bg-transparent hover:bg-white/[0.05] text-muted hover:text-text border border-transparent",
      outline:
        "bg-transparent border border-border hover:border-border-strong text-muted hover:text-text",
      glow:
        "bg-surface border border-primary/40 text-primary hover:border-primary",
    };

    const sizeStyles = {
      xs: "px-2 py-0.5 text-xs rounded-[var(--radius-sm)] gap-1.5",
      sm: "px-3 py-1.5 text-xs rounded-[var(--radius)] gap-2",
      md: "px-4 py-2 text-sm rounded-[var(--radius)] gap-2",
      lg: "px-6 py-2.5 text-base rounded-[var(--radius)] gap-2.5",
      icon: "w-8 h-8 p-0 rounded-[var(--radius)] justify-center",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
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
      </button>
    );
  },
);

Button.displayName = "Button";
