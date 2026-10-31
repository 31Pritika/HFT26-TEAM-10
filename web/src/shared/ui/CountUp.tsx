import { useEffect, useState, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface CountUpProps {
  value: number;
  duration?: number; // in seconds
  decimals?: number;
  prefix?: string;
  suffix?: string;
  formatter?: (val: number) => string;
  className?: string;
}

// Cubic bezier ease-out approximation: [0.22, 1, 0.36, 1]
function easeOutSignal(t: number): number {
  return 1 - Math.pow(1 - t, 3.5);
}

export function CountUp({
  value,
  duration = 0.8,
  decimals = 0,
  prefix = "",
  suffix = "",
  formatter,
  className,
}: CountUpProps) {
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(0);
  const startRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const startVal = startRef.current;
    const endVal = value;
    const animDuration = reducedMotion ? 0 : duration * 1000;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / animDuration, 1);
      const easedProgress = easeOutSignal(progress);
      
      const current = startVal + (endVal - startVal) * easedProgress;
      setDisplayValue(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endVal);
        startRef.current = endVal;
        startTimeRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      startTimeRef.current = null;
    };
  }, [value, duration, reducedMotion]);

  const formatted = formatter
    ? formatter(displayValue)
    : decimals > 0
    ? displayValue.toFixed(decimals)
    : Math.round(displayValue).toLocaleString();

  return (
    <span className={cn("tabular-nums tracking-tight", className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
