import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence, type Variants } from "motion/react";

interface PageTransitionProps {
  children: ReactNode;
}

const variants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.16, ease: "linear" } },
  exit: { opacity: 0, transition: { duration: 0.08, ease: "linear" } },
};

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full h-full flex flex-col flex-1"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
