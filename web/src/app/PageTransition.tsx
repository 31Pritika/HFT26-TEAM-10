import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";

interface PageTransitionProps {
  children: ReactNode;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades each page in over the last one's removal, so navigation never waits on an exit. */
export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      key={location.pathname}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(4px)" }}
      // The filter must clear at rest, or it would trap the fixed-position Drawer inside the page.
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex w-full flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}
