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
        "flex items-center gap-1 overflow-x-auto",
        variant === "underline" ? "border-b border-border pb-px" : "bg-surface-solid/80 p-1 rounded-xl border border-border",
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
              "relative flex items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors select-none",
              variant === "underline"
                ? "px-4 py-2.5 text-muted hover:text-text"
                : "px-3 py-1.5 rounded-lg text-muted hover:text-text",
              active && "text-text font-semibold",
            )}
          >
            {Icon && <Icon className={cn("w-4 h-4", active ? "text-primary" : "text-muted")} />}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  "font-mono text-xs px-1.5 py-0.5 rounded-md",
                  active
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-surface text-muted border border-border",
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
                  className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-primary via-cyan-400 to-primary-2 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              ) : (
                <motion.div
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-lg bg-surface border border-white/10 -z-10 shadow-sm"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )
            )}
          </button>
        );
      })}
    </div>
  );
}

