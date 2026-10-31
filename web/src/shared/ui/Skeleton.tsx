import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circle" | "rect" | "card";
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({
  variant = "rect",
  width,
  height,
  className,
  style,
  ...props
}: SkeletonProps) {
  const variantStyles = {
    text: "h-4 w-full rounded",
    circle: "rounded-full aspect-square",
    rect: "rounded-md w-full",
    card: "rounded-md border border-border p-5 w-full h-32",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-surface before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-text/[0.05] before:to-transparent",
        variantStyles[variant],
        className,
      )}
      style={{
        width,
        height,
        ...style,
      }}
      {...props}
    />
  );
}

