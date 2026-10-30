import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  width = "max-w-xl",
  className,
}: DrawerProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Drawer content */}
          {isMobile ? (
            // Mobile Bottom Sheet
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
              className={cn(
                "fixed bottom-0 inset-x-0 z-50 flex max-h-[88vh] flex-col rounded-t-2xl border-t border-white/10 bg-[#090c16]/98 p-5 shadow-2xl backdrop-blur-2xl",
                className,
              )}
            >
              {/* Drag Handle Indicator */}
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" />
              
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div>
                  {title && <h3 className="font-display text-lg font-semibold text-text">{title}</h3>}
                  {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-muted hover:text-text hover:bg-white/10 transition-colors"
                  aria-label="Close drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4">{children}</div>
            </motion.div>
          ) : (
            // Desktop / Tablet Right Slide-over
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
              className={cn(
                "fixed right-0 top-0 bottom-0 z-50 flex w-full flex-col border-l border-white/10 bg-[#090c16]/95 shadow-2xl backdrop-blur-2xl",
                width,
                className,
              )}
            >
              <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
                <div>
                  {title && <h3 className="font-display text-xl font-semibold text-text">{title}</h3>}
                  {description && <p className="text-xs text-muted mt-1">{description}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-muted hover:text-text hover:bg-white/10 transition-colors"
                  aria-label="Close drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">{children}</div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
