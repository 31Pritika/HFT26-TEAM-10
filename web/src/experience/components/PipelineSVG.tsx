/**
 * PipelineSVG — animated SVG pipeline for "How it works without SSL decryption" section.
 * Steps light up as user scrolls. Each step reveals a node in the pipeline.
 */
import { motion } from "motion/react";

const STEPS = [
  {
    id: "proc",
    label: "Process Map",
    desc: "psutil maps every process to its network socket — no root needed.",
    icon: "⚙",
    color: "#22D3EE",
    x: 60,
    y: 80,
  },
  {
    id: "dns",
    label: "DNS / TLS-SNI",
    desc: "We sniff DNS on UDP 53 and read the plaintext SNI in every TLS handshake.",
    icon: "🔍",
    color: "#8B5CF6",
    x: 200,
    y: 40,
  },
  {
    id: "loop",
    label: "Loopback Sniff",
    desc: "Local LLMs (Ollama, LM Studio) speak plain HTTP on localhost — full payloads visible.",
    icon: "🌀",
    color: "#34D399",
    x: 200,
    y: 120,
  },
  {
    id: "detector",
    label: "Detector",
    desc: "Regex, entropy, Luhn/Verhoeff, agent-action parser fire on every payload.",
    icon: "🛡",
    color: "#FF8A3D",
    x: 350,
    y: 80,
  },
  {
    id: "risk",
    label: "Risk Engine",
    desc: "Findings weighted by severity, provider trust, recency decay → org risk 0–100.",
    icon: "📊",
    color: "#FACC15",
    x: 490,
    y: 80,
  },
  {
    id: "console",
    label: "Console",
    desc: "Live dashboard, alerts, compliance report — nothing leaves your machine.",
    icon: "🖥",
    color: "#22D3EE",
    x: 630,
    y: 80,
  },
];

const EDGES = [
  { from: "proc", to: "detector" },
  { from: "dns", to: "detector" },
  { from: "loop", to: "detector" },
  { from: "detector", to: "risk" },
  { from: "risk", to: "console" },
];

function getStep(id: string) {
  return STEPS.find((s) => s.id === id)!;
}

interface PipelineSVGProps {
  activeStep: number;
}

export function PipelineSVG({ activeStep }: PipelineSVGProps) {
  return (
    <svg
      viewBox="0 0 720 200"
      className="w-full max-w-3xl mx-auto"
      aria-label="Pipeline diagram"
      style={{ overflow: "visible" }}
    >
      {/* Edges */}
      {EDGES.map(({ from, to }, i) => {
        const a = getStep(from);
        const b = getStep(to);
        const stepIdx = STEPS.findIndex((s) => s.id === to);
        const active = activeStep >= stepIdx;
        return (
          <motion.line
            key={i}
            x1={a.x + 26}
            y1={a.y + 26}
            x2={b.x + 26}
            y2={b.y + 26}
            stroke={active ? a.color : "rgba(148,163,255,0.15)"}
            strokeWidth={active ? 2 : 1.5}
            strokeDasharray={active ? "none" : "4 4"}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: active ? 1 : 0.4, opacity: active ? 1 : 0.3 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        );
      })}

      {/* Nodes */}
      {STEPS.map((step, i) => {
        const active = activeStep >= i;
        return (
          <motion.g key={step.id} transform={`translate(${step.x}, ${step.y})`}>
            {/* Glow */}
            <motion.circle
              cx={26}
              cy={26}
              r={28}
              fill={step.color}
              animate={{ opacity: active ? 0.15 : 0, r: active ? 32 : 26 }}
              transition={{ duration: 0.5 }}
            />
            {/* Node circle */}
            <motion.circle
              cx={26}
              cy={26}
              r={26}
              fill={active ? `${step.color}22` : "rgba(17,22,39,0.8)"}
              stroke={active ? step.color : "rgba(148,163,255,0.2)"}
              strokeWidth={active ? 1.5 : 1}
              animate={{ scale: active ? 1 : 0.92 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            />
            {/* Icon */}
            <text
              x={26}
              y={22}
              textAnchor="middle"
              fontSize={18}
              style={{ userSelect: "none" }}
            >
              {step.icon}
            </text>
            {/* Dot indicator */}
            <motion.circle
              cx={26}
              cy={26}
              r={3}
              fill={step.color}
              animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              style={{ transformOrigin: "26px 26px" }}
            />
            {/* Label */}
            <text
              x={26}
              y={62}
              textAnchor="middle"
              fontSize={9.5}
              fill={active ? "#E8ECF5" : "#4B5368"}
              fontFamily="Space Grotesk, sans-serif"
              fontWeight={600}
            >
              {step.label}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

interface PipelineStepCardProps {
  step: (typeof STEPS)[0];
  index: number;
  active: boolean;
  onClick?: () => void;
}

export function PipelineStepCard({ step, index, active, onClick }: PipelineStepCardProps) {
  return (
    <motion.div
      onClick={onClick}
      className="flex gap-4 p-4 rounded-[var(--radius)] transition-all duration-300 cursor-pointer select-none"
      animate={{
        background: active ? `${step.color}12` : "transparent",
        borderColor: active ? `${step.color}40` : "rgba(148,163,255,0.1)",
      }}
      style={{ border: "1px solid" }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div
        className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center text-lg shrink-0"
        style={{
          background: active ? `${step.color}22` : "rgba(17,22,39,0.6)",
          color: active ? step.color : "var(--muted)",
          transition: "all 0.3s",
        }}
      >
        {step.icon}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="text-sm font-semibold font-mono"
            style={{ color: active ? step.color : "var(--muted)" }}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3
            className="text-sm font-semibold font-display"
            style={{ color: active ? "var(--text)" : "var(--muted)" }}
          >
            {step.label}
          </h3>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: active ? "var(--muted)" : "var(--faint)" }}>
          {step.desc}
        </p>
      </div>
    </motion.div>
  );
}

export { STEPS as PIPELINE_STEPS };
