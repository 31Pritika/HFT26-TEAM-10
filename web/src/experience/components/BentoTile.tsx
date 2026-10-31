import { useRef } from "react";
import { motion, useInView } from "motion/react";
import type { ReactNode } from "react";

interface BentoTileProps {
  icon: ReactNode;
  title: string;
  description: string;
  tag?: string;
  accent?: string;
  className?: string;
  delay?: number;
}

export function BentoTile({
  icon,
  title,
  description,
  tag,
  accent: _accent = "var(--primary)",
  className = "",
  delay = 0,
}: BentoTileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      className={`relative rounded-[var(--radius)] overflow-hidden p-6 flex flex-col gap-3 border border-border bg-surface transition-colors hover:border-border-strong ${className}`}
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center border border-border bg-surface-solid text-primary"
      >
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <h3 className="text-base font-medium text-text font-display">
            {title}
          </h3>
          {tag && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-border bg-surface-solid text-muted"
            >
              {tag}
            </span>
          )}
        </div>
        <p className="text-sm text-muted leading-relaxed font-sans">{description}</p>
      </div>
    </motion.div>
  );
}
