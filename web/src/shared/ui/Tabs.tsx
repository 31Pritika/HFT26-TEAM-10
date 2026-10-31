import React from "react";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  layoutId?: string;
  variant?: "underline" | "pills";
  className?: string;
}

export function Tabs({
  items,
  value,
  onChange,
  layoutId = "active-tab",
  variant = "underline",
  className,
}: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex flex-wrap items-center gap-1",
        variant === "underline" ? "border-b border-border pb-px" : "bg-surface-solid p-1 rounded-md border border-border",
        className,
      )}
    >
      {items.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative z-0 flex items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors select-none",
              variant === "underline"
                ? "px-4 py-2.5 text-muted hover:text-text"
                : "px-3 py-1.5 rounded-sm text-muted hover:text-text",
              active && "text-text",
            )}
          >
            {Icon && <Icon className={cn("w-4 h-4", active ? "text-primary" : "text-muted")} />}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-sm border border-border",
                  active ? "bg-elevated text-text" : "bg-surface text-muted",
                )}
              >
                {tab.count}
              </span>
            )}

            {/* Active animated indicator */}
            {active && (
              variant === "underline" ? (
                <motion.div
                  layoutId={layoutId}
                  className="absolute bottom-0 inset-x-0 h-0.5 bg-primary"
                  transition={{ type: "spring", stiffness: 420, damping: 38 }}
                />
              ) : (
                <motion.div
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-sm bg-elevated -z-10"
                  transition={{ type: "spring", stiffness: 420, damping: 38 }}
                />
              )
            )}
          </button>
        );
      })}
    </div>
  );
}

