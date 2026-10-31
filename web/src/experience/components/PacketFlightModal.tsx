/**
 * PacketFlightModal — "Simulate sending to ChatGPT" microinteraction.
 *
 * Shows an animated data packet flying toward an AI provider orb.
 * If risk >= high (score >= 40), the ShadowScope ring intercepts the packet
 * with a red flash shockwave and stamps "BLOCKED BY SHADOWSCOPE".
 * If clean, the packet safely passes through to the provider.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  X,
  Zap,
  Terminal,
  Lock,
} from "lucide-react";
import type { ScannerResult } from "../lib/scanner";

interface PacketFlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  scanResult: ScannerResult;
}

export function PacketFlightModal({ isOpen, onClose, scanResult }: PacketFlightModalProps) {
  const [animationKey, setAnimationKey] = useState(0);
  const [flightPhase, setFlightPhase] = useState<"depart" | "intercept" | "finish">("depart");

  const isBlocked = scanResult.risk_score >= 40;

  useEffect(() => {
    if (!isOpen) return;
    setFlightPhase("depart");
    const t1 = setTimeout(() => {
      setFlightPhase("intercept");
    }, 1200);

    const t2 = setTimeout(() => {
      setFlightPhase("finish");
    }, 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isOpen, animationKey]);

  if (!isOpen) return null;

  const handleReplay = () => {
    setAnimationKey((prev) => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-2xl rounded-[var(--radius-lg)] border border-border-strong overflow-hidden"
        style={{
          background: "#0f1219",
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-solid/50">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{
                background: isBlocked ? "var(--critical)" : "var(--low)",
              }}
            />
            <h3 className="font-display font-bold text-base text-text">
              Transmission Interception Simulation
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Flight Stage Canvas */}
        <div className="relative h-64 sm:h-72 w-full p-6 flex items-center justify-between overflow-hidden bg-black/40">
          {/* Background Grid */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(186,215,247,1) 1px, transparent 1px), linear-gradient(90deg, rgba(186,215,247,1) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* Left Node: Local Client */}
          <div className="relative z-10 flex flex-col items-center text-center gap-2">
            <div className="relative w-16 h-16 rounded-2xl border border-primary/40 bg-surface flex items-center justify-center">
              <Terminal className="w-7 h-7 text-primary" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-sm bg-primary/20 border border-primary flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-sm bg-primary animate-ping" />
              </div>
            </div>
            <div>
              <div className="text-xs font-bold font-display text-text">Client Node</div>
              <div className="text-[10px] font-mono text-muted">localhost:8789</div>
            </div>
          </div>

          {/* Center: ShadowScope Scope Ring */}
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="relative flex items-center justify-center">
              {/* Ring Outer Glow */}
              <motion.div
                key={`glow-${animationKey}`}
                className="absolute w-28 h-28 rounded-sm border-2"
                style={{
                  borderColor:
                    flightPhase !== "depart" && isBlocked
                      ? "rgba(223,106,104,0.8)"
                      : "rgba(186,215,247,0.5)",
                }}
                animate={
                  flightPhase === "intercept" && isBlocked
                    ? { scale: [1, 1.25, 1], opacity: [0.7, 1, 0.8] }
                    : { scale: [1, 1.05, 1] }
                }
                transition={{ duration: 0.6 }}
              />

              {/* Inner Ring */}
              <div
                className="w-20 h-20 rounded-sm border border-dashed flex items-center justify-center bg-bg/80"
                style={{
                  borderColor:
                    flightPhase !== "depart" && isBlocked ? "var(--critical)" : "var(--primary)",
                }}
              >
                {flightPhase !== "depart" && isBlocked ? (
                  <ShieldAlert className="w-8 h-8 text-critical" />
                ) : (
                  <Zap className="w-8 h-8 text-primary" />
                )}
              </div>
            </div>
            <div className="mt-2 text-[10px] font-mono font-bold text-primary">
              SHADOWSCOPE RING
            </div>
          </div>

          {/* Right Node: ChatGPT Provider */}
          <div className="relative z-10 flex flex-col items-center text-center gap-2">
            <div className="relative w-16 h-16 rounded-2xl border border-emerald-500/40 bg-surface flex items-center justify-center">
              <div className="w-8 h-8 rounded-sm bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold font-mono text-sm">
                AI
              </div>
            </div>
            <div>
              <div className="text-xs font-bold font-display text-text">OpenAI API</div>
              <div className="text-[10px] font-mono text-muted">api.openai.com</div>
            </div>
          </div>

          {/* Flying Data Packet */}
          <AnimatePresence>
            <motion.div
              key={`packet-${animationKey}`}
              className="absolute top-1/2 left-16 z-20 -translate-y-1/2"
              initial={{ x: 0, opacity: 1, scale: 1 }}
              animate={
                isBlocked
                  ? {
                      x: [0, 220, 240],
                      opacity: [1, 1, 0],
                      scale: [1, 1.2, 0.2],
                    }
                  : {
                      x: [0, 220, 460],
                      opacity: [1, 1, 0.8],
                      scale: [1, 1, 0.8],
                    }
              }
              transition={{
                duration: isBlocked ? 1.4 : 1.9,
                times: isBlocked ? [0, 0.8, 1] : [0, 0.5, 1],
                ease: "easeInOut",
              }}
            >
              <div
                className="w-6 h-6 rounded-sm flex items-center justify-center"
                style={{
                  background:
                    flightPhase === "intercept" && isBlocked ? "var(--critical)" : "var(--primary)",
                }}
              >
                <div className="w-2 h-2 rounded-sm bg-white" />
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Stamp Notification */}
          <AnimatePresence>
            {flightPhase === "finish" && (
              <motion.div
                initial={{ opacity: 0, scale: 2, rotate: -15 }}
                animate={{ opacity: 1, scale: 1, rotate: -6 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 350, damping: 20 }}
                className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
              >
                {isBlocked ? (
                  <div
                    className="px-6 py-3 rounded-xl border-4 border-dashed text-xl sm:text-2xl font-black font-mono"
                    style={{
                      borderColor: "var(--critical)",
                      color: "var(--critical)",
                      background: "rgba(223,106,104,0.18)",
                    }}
                  >
                    BLOCKED BY SHADOWSCOPE
                  </div>
                ) : (
                  <div
                    className="px-6 py-3 rounded-xl border-4 border-dashed text-xl sm:text-2xl font-black font-mono"
                    style={{
                      borderColor: "var(--low)",
                      color: "var(--low)",
                      background: "rgba(134,182,154,0.18)",
                    }}
                  >
                    CLEAN · TRANSMISSION OK
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Modal Info Footer */}
        <div className="p-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isBlocked ? (
              <div className="w-10 h-10 rounded-xl bg-critical/15 border border-critical/30 flex items-center justify-center text-critical">
                <Lock className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-low/15 border border-low/30 flex items-center justify-center text-low">
                <ShieldCheck className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="font-display font-bold text-sm text-text">
                {isBlocked
                  ? `Intercepted: Risk Score ${scanResult.risk_score}/100 (Grade ${scanResult.risk_grade})`
                  : `Payload Passed: Risk Score ${scanResult.risk_score}/100 (Grade ${scanResult.risk_grade})`}
              </div>
              <p className="text-xs text-muted">
                {isBlocked
                  ? `${scanResult.findings.length} findings caught before hitting external AI endpoints.`
                  : "Zero critical secrets or PII detected. Packet delivered to provider."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReplay}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)] border border-border text-xs font-semibold text-text hover:bg-surface transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-primary" />
              Replay
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-[var(--radius-sm)] bg-primary text-black text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
