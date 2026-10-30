import { useRef, useState } from "react";
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
  accent = "var(--primary)",
  className = "",
  delay = 0,
}: BentoTileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x =
      ((e.clientY - rect.top - rect.height / 2) / (rect.height / 2)) * 8;
    const y =
      -((e.clientX - rect.left - rect.width / 2) / (rect.width / 2)) * 8;
    setTilt({ x, y });
  };

  return (
    <motion.div
      ref={ref}
      className={`relative rounded-[var(--radius)] overflow-hidden p-6 flex flex-col gap-3 group ${className}`}
      style={{
        background: "var(--surface)",
        border: `1px solid var(--border)`,
        backdropFilter: "blur(16px)",
        transformStyle: "preserve-3d",
        transformOrigin: "center",
      }}
      initial={{ opacity: 0, y: 32, scale: 0.96 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        setTilt({ x: 0, y: 0 });
        setHovering(false);
      }}
      onMouseEnter={() => setHovering(true)}
      whileHover={prefersReduced ? {} : { rotateX: tilt.x, rotateY: tilt.y }}
    >
      {/* Glow effect */}
      <motion.div
        className="absolute inset-0 rounded-[var(--radius)] pointer-events-none"
        animate={hovering ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: `radial-gradient(circle at 50% 0%, ${accent}22 0%, transparent 60%)`,
          border: `1px solid ${accent}44`,
        }}
      />
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center"
        style={{ background: `${accent}18`, color: accent }}
      >
        {icon}
      </div>
      {/* Content */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <h3 className="text-base font-semibold text-text font-display">
            {title}
          </h3>
          {tag && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: `${accent}20`,
                color: accent,
                border: `1px solid ${accent}40`,
              }}
            >
              {tag}
            </span>
          )}
        </div>
        <p className="text-sm text-muted leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}
