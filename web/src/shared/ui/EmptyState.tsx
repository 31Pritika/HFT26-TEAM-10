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
        "flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-white/10 bg-surface/30 backdrop-blur-md",
        className,
      )}
    >
      {/* Futuristic Radar / Shield Graphic */}
      <div className="relative mb-4 flex items-center justify-center">
        {/* Animated concentric scanning circles */}
        <div className="absolute w-24 h-24 rounded-full border border-cyan-500/15 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
        <div className="absolute w-16 h-16 rounded-full border border-violet-500/20" />
        <div className="w-12 h-12 rounded-xl bg-surface-solid border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
          <Icon className="w-6 h-6" />
        </div>
      </div>

      <h3 className="font-display text-lg font-semibold text-text">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted leading-relaxed">{description}</p>

      {action && (
        <div className="mt-5">
          <Button variant="primary" size="sm" onClick={action.onClick} magnetic>
            {ActionIcon && <ActionIcon className="w-4 h-4" />}
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}

