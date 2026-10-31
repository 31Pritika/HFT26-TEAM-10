import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Button } from "./Button";
import { ShieldCheck } from "lucide-react";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ComponentType<{ className?: string }>;
  };
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon = ShieldCheck,
  action,
  className,
}: EmptyStateProps) {
  const ActionIcon = action?.icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center rounded-[var(--radius)] border border-dashed border-border bg-surface",
        className,
      )}
    >
      <div className="relative mb-4 flex items-center justify-center">
        <div className="w-11 h-11 rounded-[var(--radius)] bg-surface-solid border border-border flex items-center justify-center text-primary">
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <h3 className="font-display text-base font-medium text-text">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted leading-relaxed font-sans">{description}</p>

      {action && (
        <div className="mt-5">
          <Button variant="primary" size="sm" onClick={action.onClick}>
            {ActionIcon && <ActionIcon className="w-4 h-4" />}
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
