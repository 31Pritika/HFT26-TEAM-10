/**
 * Landing page — "/"
 * Stage Light aesthetic: pure black stage, warm tungsten accents, flat solid surfaces.
 * Sections: StageLightHero → Problem → How it works → Features → Agent demo → Privacy → CTA → SiteFooter
 */
import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useInView } from "motion/react";
import {
  Shield,
  Eye,
  Lock,
  Zap,
  AlertTriangle,
  Terminal,
  Globe,
  ArrowRight,
  Activity,
  Search,
  Database,
  Radio,
} from "lucide-react";

import { StageLightHero } from "../components/StageLightHero";
import { BentoTile } from "../components/BentoTile";
import { PipelineSVG, PipelineStepCard, PIPELINE_STEPS } from "../components/PipelineSVG";
import { RogueAgentTerminal } from "../components/RogueAgentTerminal";
import { TypedLeakyPrompt } from "../components/TypedLeakyPrompt";
import { SiteFooter } from "../components/SiteFooter";
import { useDocumentTitle } from "../../shared/useDocumentTitle";

// ── Section: Problem ──────────────────────────────────────────────────────────

function ProblemSection() {
  const ref = useRef<HTMLDivElement>(null);

  const stats = [
    { value: "Most", label: "developers use AI tools their security team never approved" },
    { value: "21", label: "secret patterns can appear in a single AI chat session" },
    { value: "TLS", label: "encryption hides traffic from traditional network scanners" },
    { value: "0 ms", label: "notice when a rogue agent exfiltrates data to ChatGPT" },
  ];

  return (
    <section
      ref={ref}
      className="relative py-20 md:py-28 px-6 bg-bg-2 border-b border-border"
    >
      <div className="max-w-5xl mx-auto relative">
        <h2
          className="font-display font-medium mb-6 text-text"
          style={{ fontSize: "clamp(1.8rem, 3.5vw + 0.5rem, 3rem)" }}
        >
          Shadow AI is already inside your org.
        </h2>

        <p className="max-w-2xl mb-12 text-base sm:text-lg leading-relaxed text-muted font-sans">
          Developers paste source code, credentials, and customer PII into unmonitored AI
          tools. Autonomous agents wire themselves to shells, filesystems, and internal APIs —
          with zero governance. All of it encrypted. All of it invisible.{" "}
          <strong className="text-text font-medium">Until now.</strong>
        </p>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-14">
          {stats.map(({ value, label }) => (
            <div
              key={label}
              className="p-5 rounded-[var(--radius)] flex gap-4 items-start bg-surface border border-border"
            >
              <div className="text-2xl font-display font-medium tabular-nums shrink-0 text-critical">
                {value}
              </div>
              <div className="text-sm leading-relaxed text-muted font-sans">
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Leaky prompt demo */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle
              className="w-4 h-4 text-critical"
              aria-hidden="true"
            />
            <p className="text-xs sm:text-sm font-mono text-critical">
              Real example: this prompt was about to leave your org
            </p>
          </div>
          <TypedLeakyPrompt />
        </div>
      </div>
    </section>
  );
}

// ── Section: How it works ─────────────────────────────────────────────────────

function HowItWorksSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-60px" });
  const [activeStep, setActiveStep] = useState(0);

  // Auto-advance step timer
  useEffect(() => {
    if (!isInView) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % PIPELINE_STEPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [isInView]);

  return (
    <section
      ref={containerRef}
      id="how-it-works"
      className="relative px-6 py-20 md:py-28 bg-bg border-b border-border"
    >
      <div className="max-w-5xl mx-auto relative">
        <h2
          className="font-display font-medium mb-4 text-text"
          style={{ fontSize: "clamp(1.8rem, 3.5vw + 0.5rem, 3rem)" }}
        >
          No SSL decryption. No root CA. No MITM.
        </h2>

        <p className="max-w-2xl mb-8 text-base sm:text-lg text-muted font-sans">
          We use seven legitimate OS-level & network-level sources to surface AI traffic
          without breaking encryption or requiring privileged access.
        </p>

        {/* SVG pipeline */}
        <div className="mb-8">
          <PipelineSVG activeStep={activeStep} />
        </div>

        {/* Step cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PIPELINE_STEPS.map((step, i) => (
            <PipelineStepCard
              key={step.id}
              step={step}
              index={i}
              active={activeStep >= i}
              onClick={() => setActiveStep(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section: Features bento grid ──────────────────────────────────────────────

const BENTO_TILES = [
  {
    icon: <Search className="w-5 h-5" aria-hidden="true" />,
    title: "Shadow AI Inventory",
    description:
      "Automatically discovers every AI tool, coding assistant, and local LLM talking on your network — sanctioned or not.",
    tag: "Live",
    accent: "var(--primary)",
    delay: 0,
  },
  {
    icon: <Lock className="w-5 h-5" aria-hidden="true" />,
    title: "Secret & PII Detection",
    description:
      "21+ secret patterns, Aadhaar/PAN validation, Luhn credit-card checks, Shannon entropy analysis — all client-side.",
    tag: "DPDP",
    accent: "var(--critical)",
    delay: 0.05,
  },
  {
    icon: <Activity className="w-5 h-5" aria-hidden="true" />,
    title: "Agent Permission Tracking",
    description:
      "Visualize every shell exec, file read, and tool call an autonomous agent makes. Autonomy score 0–100.",
    tag: "Agents",
    accent: "var(--high)",
    delay: 0.1,
  },
  {
    icon: <Zap className="w-5 h-5" aria-hidden="true" />,
    title: "AI Analyst Triage",
    description:
      "Featherless → Groq → Ollama → rules fallback. Redacts secrets before sending. Shows proof of redaction.",
    tag: "LLM",
    accent: "var(--accent)",
    delay: 0.15,
  },
  {
    icon: <AlertTriangle className="w-5 h-5" aria-hidden="true" />,
    title: "Honeytoken Canaries",
    description:
      "Plant fake API keys, Aadhaar numbers, and DB strings. If they appear in AI traffic → instant critical alert.",
    tag: "Canary",
    accent: "var(--medium)",
    delay: 0.2,
  },
  {
    icon: <Globe className="w-5 h-5" aria-hidden="true" />,
    title: "Opt-in AI Gateway",
    description:
      "Route traffic through localhost:8789 for full payload inspection — and block mode to stop dangerous requests.",
    tag: "Block",
    accent: "var(--primary-2)",
    delay: 0.25,
  },
  {
    icon: <Radio className="w-5 h-5" aria-hidden="true" />,
    title: "Browser Extension",
    description:
      "MV3 content script captures pastes into ChatGPT, Claude, and Gemini — catches what process monitoring can't.",
    tag: "Chrome",
    accent: "var(--primary)",
    delay: 0.3,
  },
  {
    icon: <Database className="w-5 h-5" aria-hidden="true" />,
    title: "Compliance Reports",
    description:
      "DPDP Act 2023, GDPR, SOC 2, PCI-DSS, ISO 27001 scorecards with per-control pass/warn/fail. Print to PDF.",
    tag: "PDF",
    accent: "var(--low)",
    delay: 0.35,
  },
];

function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <section
      ref={ref}
      className="relative py-20 md:py-28 px-6 bg-bg-2 border-b border-border"
    >
      <div className="max-w-5xl mx-auto relative">
        <h2
          className="font-display font-medium mb-10 text-text"
          style={{ fontSize: "clamp(1.8rem, 3.5vw + 0.5rem, 3rem)" }}
        >
          Everything security needs to tame AI sprawl.
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BENTO_TILES.map((tile) => (
            <BentoTile key={tile.title} {...tile} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section: Rogue agent terminal ─────────────────────────────────────────────

function AgentDemoSection() {
  return (
    <section
      className="relative py-20 md:py-28 px-6 bg-bg border-b border-border"
    >
      <div className="max-w-5xl mx-auto">
        <h2
          className="font-display font-medium mb-4 text-text"
          style={{ fontSize: "clamp(1.8rem, 3.5vw + 0.5rem, 3rem)" }}
        >
          Watch ShadowScope intercept a rogue AI agent.
        </h2>

        <p className="max-w-2xl mb-8 text-base sm:text-lg text-muted font-sans">
          A CrewAI agent attempts to read SSH keys, run a remote shell, and escalate
          privileges. ShadowScope flags and blocks each move in real time.
        </p>

        <div>
          <RogueAgentTerminal />
        </div>

        {/* Try it CTA */}
        <div className="mt-8 flex justify-center">
          <Link
            to="/playground"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium px-4 py-2 rounded-[var(--radius)] border border-border hover:border-border-strong bg-surface text-text hover:text-white transition-colors"
          >
            <Terminal className="w-4 h-4 text-primary" aria-hidden="true" />
            <span>Scan your own prompts in the Playground</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Section: Privacy promise ──────────────────────────────────────────────────

function PrivacySection() {
  const promises = [
    {
      icon: <Lock className="w-5 h-5" aria-hidden="true" />,
      title: "Nothing leaves your machine",
      desc: "All detection runs locally. No telemetry, no cloud backend, no opt-in needed.",
      color: "var(--primary)",
    },
    {
      icon: <Shield className="w-5 h-5" aria-hidden="true" />,
      title: "Secrets redacted before any LLM",
      desc: "The AI triage engine receives only a sanitized snippet — never the raw secret.",
      color: "var(--accent)",
    },
    {
      icon: <Database className="w-5 h-5" aria-hidden="true" />,
      title: "SQLite-only local storage",
      desc: "Findings stored in a local SQLite file you control. Delete it and the data is gone.",
      color: "var(--low)",
    },
    {
      icon: <Eye className="w-5 h-5" aria-hidden="true" />,
      title: "Open source & auditable",
      desc: "Every detection rule, every redaction step — in this repo, MIT licensed, no closed code.",
      color: "var(--medium)",
    },
  ];

  return (
    <section
      className="relative py-20 md:py-28 px-6 bg-bg-2 border-b border-border"
    >
      <div className="max-w-5xl mx-auto">
        <h2
          className="font-display font-medium mb-10 text-text"
          style={{ fontSize: "clamp(1.8rem, 3.5vw + 0.5rem, 3rem)" }}
        >
          We guard your secrets as carefully as we catch them.
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {promises.map(({ icon, title, desc, color }) => (
            <div
              key={title}
              className="flex gap-4 p-5 rounded-[var(--radius)] bg-surface border border-border"
            >
              <div
                className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 border border-border bg-surface-solid"
                style={{ color }}
              >
                {icon}
              </div>
              <div>
                <h3 className="font-display font-medium mb-1 text-sm text-text">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-muted font-sans">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section: Final CTA ────────────────────────────────────────────────────────

function FinalCTASection() {
  return (
    <section
      className="relative py-24 md:py-36 px-6 overflow-hidden bg-black"
    >
      <div className="max-w-3xl mx-auto text-center relative z-10">
        <h2
          className="font-display font-medium mb-6 text-text"
          style={{ fontSize: "clamp(2rem, 4vw + 0.5rem, 3.5rem)" }}
        >
          See every AI conversation.{" "}
          <span className="text-primary">Stop every leak.</span>
        </h2>

        <p className="mb-10 text-base sm:text-lg text-muted max-w-2xl mx-auto leading-relaxed font-sans">
          No TLS decryption. No invasive proxies. No agents to deploy.{" "}
          <br className="hidden md:block" />
          Just run ShadowScope and finally know what AI is doing inside your org.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/app"
            className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-[var(--radius)] bg-primary text-primary-ink font-semibold text-sm transition-all hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Terminal className="w-4 h-4" aria-hidden="true" />
            <span>Open the Console</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>

          <Link
            to="/playground"
            className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-[var(--radius)] bg-surface border border-border hover:border-border-strong text-text hover:text-white text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Zap className="w-4 h-4 text-primary" aria-hidden="true" />
            <span>Try the Playground</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────

export default function Landing() {
  useDocumentTitle("ShadowScope · AI Shadow IT & Agentic Data Exfiltration Scanner");

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-black text-text flex flex-col antialiased">
      {/* Stage Light Hero Section */}
      <StageLightHero onHowItWorksClick={scrollToHowItWorks} />

      {/* Problem Section */}
      <ProblemSection />

      {/* How It Works Section */}
      <HowItWorksSection />

      {/* Features Bento Section */}
      <FeaturesSection />

      {/* Rogue Agent Demo Terminal */}
      <AgentDemoSection />

      {/* Privacy Promise Section */}
      <PrivacySection />

      {/* Final Launch CTA Section */}
      <FinalCTASection />

      {/* Shared Site Footer with canonical links */}
      <SiteFooter />
    </div>
  );
}
