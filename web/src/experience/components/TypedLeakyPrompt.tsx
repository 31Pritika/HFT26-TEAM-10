/**
 * TypedLeakyPrompt — animated typed prompt that types text character-by-character,
 * then "redacts" the sensitive parts with a sweeping overlay.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";

const FULL_TEXT = `Hi Claude, I'm debugging our payment system.
Here's the prod DB creds:
postgres://admin:Str0ngP@ss#2024!@db.corp.internal:5432/payments_prod

AWS key: AKIAFAKEFAKE1234ABCD
Secret: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

Customer data dump (first 3):
Name: Rahul Sharma, Aadhaar: 4321 6543 9876, PAN: ABCFG1234H
Name: Priya Patel, Card: 4111 1111 1111 1111 (CVV 123)
Email: rahul@corp.com, Phone: +91 9876543210

Can you help me fix the SQL query?`;

// Ranges to redact [start, end) — character indices
const REDACT_RANGES = [
  // DB URL
  [57, 113],
  // AWS key line
  [115, 167],
  // Secret line
  [168, 232],
  // Aadhaar
  [284, 299],
  // PAN
  [305, 316],
  // Card
  [333, 355],
  // Email
  [367, 383],
  // Phone
  [393, 407],
];

function isRedacted(i: number) {
  return REDACT_RANGES.some(([s, e]) => i >= s && i < e);
}

export function TypedLeakyPrompt() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [typed, setTyped] = useState(0);
  const [redacting, setRedacting] = useState(false);
  const [redactProgress, setRedactProgress] = useState(0);
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isInView) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setTyped(FULL_TEXT.length);
      setRedacting(true);
      setRedactProgress(1);
      return;
    }

    let i = 0;
    const charDelay = 18; // ms per char

    const typeInterval = setInterval(() => {
      i++;
      setTyped(i);
      if (i >= FULL_TEXT.length) {
        clearInterval(typeInterval);
        // Start redaction after a short pause
        setTimeout(() => {
          setRedacting(true);
          const redactStart = Date.now();
          const redactDuration = 1800;
          const tick = () => {
            const progress = Math.min((Date.now() - redactStart) / redactDuration, 1);
            setRedactProgress(progress);
            if (progress < 1) rafRef.current = setTimeout(tick, 16);
          };
          rafRef.current = setTimeout(tick, 16);
        }, 600);
      }
    }, charDelay);

    return () => {
      clearInterval(typeInterval);
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, [isInView]);

  const displayText = FULL_TEXT.slice(0, typed);

  return (
    <div ref={ref} className="w-full">
      <div
        className="relative rounded-[var(--radius)] overflow-hidden"
        style={{
          background: "rgba(10,11,18,0.92)",
          border: "1px solid rgba(148,163,255,0.15)",
          boxShadow: "0 0 40px rgba(34,211,238,0.06)",
        }}
      >
        {/* Editor header */}
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ background: "#0D0E18", borderBottom: "1px solid rgba(148,163,255,0.1)" }}
        >
          <span className="text-xs font-mono" style={{ color: "#8A93A8" }}>To: Claude (claude.ai)</span>
          {redacting && (
            <motion.span
              className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ background: "rgba(255,59,92,0.15)", color: "#FF3B5C", border: "1px solid rgba(255,59,92,0.35)" }}
            >
              🛡 SHADOWING…
            </motion.span>
          )}
        </div>

        {/* Text content */}
        <div className="p-5 font-mono text-sm leading-relaxed relative" style={{ minHeight: 260 }}>
          <div className="whitespace-pre-wrap break-words" style={{ color: "#E8ECF5" }}>
            {displayText.split("").map((char, i) => {
              const shouldRedact = isRedacted(i) && redacting;
              const revealThreshold = i / FULL_TEXT.length;
              const isRevealed = redactProgress > revealThreshold * 0.9;

              return (
                <span
                  key={i}
                  style={{
                    position: "relative",
                    transition: shouldRedact ? "none" : undefined,
                  }}
                >
                  {shouldRedact && isRevealed ? (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        display: "inline-block",
                        background: "#FF3B5C",
                        color: "#FF3B5C",
                        borderRadius: "2px",
                        minWidth: char === " " ? "4px" : "auto",
                      }}
                    >
                      {char === "\n" ? "\n" : "█"}
                    </motion.span>
                  ) : (
                    <span>{char}</span>
                  )}
                </span>
              );
            })}
            {/* Blinking cursor */}
            {typed < FULL_TEXT.length && (
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                style={{ color: "#22D3EE" }}
              >
                ▊
              </motion.span>
            )}
          </div>

          {/* Redact progress bar */}
          {redacting && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(90deg, rgba(255,59,92,0.04) 0%, transparent 100%)",
              }}
              animate={{ opacity: redactProgress < 1 ? 1 : 0 }}
              transition={{ duration: 0.5 }}
            />
          )}
        </div>

        {/* Finding badges */}
        {redacting && redactProgress > 0.5 && (
          <motion.div
            className="px-5 pb-4 flex flex-wrap gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            {[
              { label: "DB Connection URL", sev: "critical" },
              { label: "AWS Access Key", sev: "critical" },
              { label: "Aadhaar Number", sev: "high" },
              { label: "Credit Card", sev: "critical" },
              { label: "PAN Card", sev: "high" },
              { label: "Email × 2", sev: "medium" },
            ].map(({ label, sev }) => (
              <span
                key={label}
                className="text-[10px] font-mono px-2 py-1 rounded"
                style={{
                  background:
                    sev === "critical"
                      ? "rgba(255,59,92,0.15)"
                      : sev === "high"
                        ? "rgba(255,138,61,0.15)"
                        : "rgba(250,204,21,0.1)",
                  color:
                    sev === "critical" ? "#FF3B5C" : sev === "high" ? "#FF8A3D" : "#FACC15",
                  border: `1px solid ${sev === "critical" ? "#FF3B5C44" : sev === "high" ? "#FF8A3D44" : "#FACC1544"}`,
                }}
              >
                🚨 {label}
              </span>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
