/**
 * Landing page — "/"
 * Cinematic scroll story for ShadowScope.
 * Sections: Hero → Problem → How it works → Features → Agent demo → Privacy → CTA → Footer
 */
import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useInView } from "motion/react";
import {
  Shield,
  Eye,
  Lock,
  Zap,
  AlertTriangle,
  Terminal,
  Globe,
  ArrowRight,
  ChevronDown,
  Activity,
  Search,
  Database,
  Radio,
  ExternalLink,
} from "lucide-react";

import { HeroFallback } from "../components/HeroFallback";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { SplitText } from "../components/SplitText";
import { MagneticButton } from "../components/MagneticButton";
import { BentoTile } from "../components/BentoTile";
import { PipelineSVG, PipelineStepCard, PIPELINE_STEPS } from "../components/PipelineSVG";
import { RogueAgentTerminal } from "../components/RogueAgentTerminal";
import { TypedLeakyPrompt } from "../components/TypedLeakyPrompt";
import { api } from "../../shared/api";

// Lazy-load the 3D scene
const HeroScene3D = lazy(() =>
  import("../components/HeroScene3D").then((m) => ({ default: m.HeroScene3D }))
);

// ── helpers ───────────────────────────────────────────────────────────────────

function GithubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function useWebGL() {
  const [supported] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const canvas = document.createElement("canvas");
      return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      return false;
    }
  });
  return supported;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return reduced;
}

function useMobile() {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  });
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

// ── Scroll progress bar ───────────────────────────────────────────────────────

function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 z-50 h-[3px] origin-left"
      style={{
        scaleX: scrollYProgress,
        background: "linear-gradient(90deg, #22D3EE, #8B5CF6)",
        boxShadow: "0 0 10px rgba(34,211,238,0.6)",
      }}
    />
  );
}

// ── Custom cursor glow (desktop only) ─────────────────────────────────────────

function CursorGlow() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const move = (e: MouseEvent) => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${e.clientX - 160}px, ${e.clientY - 160}px)`;
      }
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, [reduced]);

  if (reduced) return null;

  return (
    <div
      ref={cursorRef}
      className="pointer-events-none fixed z-30 w-80 h-80 rounded-full hidden md:block"
      style={{
        background: "radial-gradient(circle, rgba(34,211,238,0.04) 0%, transparent 70%)",
        top: 0,
        left: 0,
        transition: "transform 0.12s ease-out",
      }}
      aria-hidden="true"
    />
  );
}

// ── Lenis smooth scroll (landing only) ───────────────────────────────────────

function useLenis(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let lenis: {
      raf: (time: number) => void;
      destroy: () => void;
    } | null = null;
    let rafId: number;

    import("lenis").then(({ default: Lenis }) => {
      lenis = new Lenis({
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });

      function raf(time: number) {
        lenis!.raf(time);
        rafId = requestAnimationFrame(raf);
      }
      rafId = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(rafId);
      lenis?.destroy();
    };
  }, [enabled]);
}

// ── Section: Hero ─────────────────────────────────────────────────────────────

function HeroSection({
  webGLSupported,
  reducedMotion,
  isMobile,
}: {
  webGLSupported: boolean | null;
  reducedMotion: boolean;
  isMobile: boolean;
}) {
  const show3D = webGLSupported && !reducedMotion && !isMobile;

  const [stats, setStats] = useState([
    { value: 150, suffix: "+", label: "AI connections tracked" },
    { value: 38, suffix: " open", label: "findings flagged" },
    { value: 21, suffix: "", label: "secrets intercepted" },
    { value: 13, suffix: "", label: "agent actions blocked" },
  ]);

  useEffect(() => {
    api.getOverview("24h")
      .then((data) => {
        if (data?.totals) {
          setStats([
            { value: data.totals.events ?? 150, suffix: "+", label: "AI connections tracked" },
            { value: data.totals.findings_open ?? 38, suffix: " open", label: "findings flagged" },
            { value: data.totals.secrets ?? 21, suffix: "", label: "secrets intercepted" },
            { value: data.totals.agent_actions ?? 13, suffix: "", label: "agent actions blocked" },
          ]);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <section
      className="relative min-h-screen flex flex-col"
      style={{ background: "#05060A" }}
    >
      {/* 3D canvas or fallback */}
      <div
        className="absolute inset-0"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        {show3D ? (
          <Suspense fallback={<HeroFallback className="w-full h-full" />}>
            <HeroScene3D className="w-full h-full" />
          </Suspense>
        ) : (
          <HeroFallback className="w-full h-full" />
        )}
        {/* Gradient overlays for readability */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(5,6,10,0.4) 0%, rgba(5,6,10,0.0) 30%, rgba(5,6,10,0.65) 80%, rgba(5,6,10,1) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, rgba(5,6,10,0.5) 100%)",
          }}
        />
      </div>

      {/* Navbar */}
      <nav
        className="relative z-10 flex items-center justify-between px-6 md:px-12 pt-6"
        aria-label="Site navigation"
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.3)" }}
          >
            <Eye className="w-4 h-4 text-primary" aria-hidden="true" />
          </div>
          <span
            className="font-display font-bold text-lg tracking-tight"
            style={{ color: "var(--text)" }}
          >
            Shadow<span style={{ color: "var(--primary)" }}>Scope</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/architecture"
            className="hidden md:block text-sm font-medium transition-colors hover:text-primary"
            style={{ color: "var(--muted)" }}
          >
            How it works
          </Link>
          <Link
            to="/app"
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-[var(--radius-sm)] transition-all hover:scale-105"
            style={{
              background: "rgba(34,211,238,0.12)",
              color: "var(--primary)",
              border: "1px solid rgba(34,211,238,0.3)",
            }}
          >
            <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
            Console
          </Link>
        </div>
      </nav>

      {/* Hero content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 text-center px-6 py-16 md:py-24">
        {/* Badge */}
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8 text-xs font-mono"
          style={{
            background: "rgba(34,211,238,0.1)",
            border: "1px solid rgba(34,211,238,0.25)",
            color: "var(--primary)",
          }}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full bg-primary"
            style={{ boxShadow: "0 0 6px var(--primary)" }}
          />
          No SSL decryption · No root CA · Privacy-first
        </motion.div>

        {/* Headline */}
        <h1
          className="font-display font-bold leading-tight mb-6 max-w-4xl"
          style={{
            fontSize: "clamp(2rem, 5vw + 1rem, 4.5rem)",
            color: "var(--text)",
          }}
        >
          <SplitText
            text="Your company is talking to AI."
            as="span"
            className="block"
            delay={0.2}
          />
          <SplitText
            text="Do you know what it's saying?"
            as="span"
            className="block"
            delay={0.5}
            stagger={0.045}
          />
        </h1>

        {/* Sub */}
        <motion.p
          className="max-w-2xl mb-10 leading-relaxed"
          style={{ color: "var(--muted)", fontSize: "clamp(1rem, 2vw, 1.2rem)" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.8 }}
        >
          ShadowScope discovers shadow AI, catches leaked secrets & PII, and tames rogue
          agents — <em style={{ color: "var(--primary)", fontStyle: "normal" }}>without breaking TLS.</em>
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 1.0 }}
        >
          <MagneticButton href="/app" className="group">
            <div
              className="flex items-center gap-2 px-7 py-3.5 rounded-[var(--radius-sm)] font-semibold text-sm transition-all"
              style={{
                background: "var(--primary)",
                color: "#05060A",
                boxShadow: "0 0 24px rgba(34,211,238,0.4), 0 4px 16px rgba(34,211,238,0.2)",
              }}
            >
              <Terminal className="w-4 h-4" aria-hidden="true" />
              Launch Console
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
          </MagneticButton>
          <MagneticButton href="/playground" className="group">
            <div
              className="flex items-center gap-2 px-7 py-3.5 rounded-[var(--radius-sm)] font-semibold text-sm transition-all"
              style={{
                background: "rgba(139,92,246,0.12)",
                color: "var(--accent)",
                border: "1px solid rgba(139,92,246,0.35)",
              }}
            >
              <Zap className="w-4 h-4" aria-hidden="true" />
              Try the Playground
            </div>
          </MagneticButton>
        </motion.div>
      </div>

      {/* Stats strip */}
      <div
        className="relative z-10 w-full"
        style={{ borderTop: "1px solid rgba(148,163,255,0.08)" }}
      >
        <div className="max-w-5xl mx-auto px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map(({ value, suffix, label }) => (
            <div key={label} className="flex flex-col items-center text-center gap-0.5">
              <div
                className="font-display font-bold tabular-nums"
                style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", color: "var(--primary)" }}
              >
                <AnimatedCounter value={value} suffix={suffix} duration={1800} />
              </div>
              <div className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll hint */}
      <motion.div
        className="relative z-10 flex justify-center pb-6"
        animate={reducedMotion ? {} : { y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <ChevronDown
          className="w-5 h-5"
          style={{ color: "var(--faint)" }}
          aria-label="Scroll for more"
        />
      </motion.div>
    </section>
  );
}

// ── Section: Problem ──────────────────────────────────────────────────────────

function ProblemSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const stats = [
    { value: "Most", label: "developers use AI tools their security team never approved" },
    { value: "21", label: "secret patterns can appear in a single AI chat session" },
    { value: "TLS", label: "encryption hides traffic from traditional network scanners" },
    { value: "0 ms", label: "notice when a rogue agent exfiltrates data to ChatGPT" },
  ];

  return (
    <section
      ref={ref}
      className="relative py-24 md:py-32 px-6"
      style={{ background: "var(--bg-2)" }}
    >
      {/* Noise texture */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="max-w-5xl mx-auto relative">
        {/* Tag */}
        <motion.div
          className="text-xs font-mono mb-4"
          style={{ color: "var(--primary)" }}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
        >
          01 / THE PROBLEM
        </motion.div>

        <SplitText
          text="Shadow AI is already inside your org."
          as="h2"
          className="font-display font-bold mb-6"
          style={{
            fontSize: "clamp(1.6rem, 3.5vw + 0.5rem, 3rem)",
            color: "var(--text)",
          } as React.CSSProperties}
          delay={0.1}
        />

        <motion.p
          className="max-w-2xl mb-14 text-lg leading-relaxed"
          style={{ color: "var(--muted)" }}
          initial={{ opacity: 0, y: 12 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.25 }}
        >
          Developers paste source code, credentials, and customer PII into unmonitored AI
          tools. Autonomous agents wire themselves to shells, filesystems, and internal APIs —
          with zero governance. All of it encrypted. All of it invisible.{" "}
          <strong style={{ color: "var(--text)" }}>Until now.</strong>
        </motion.p>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-16">
          {stats.map(({ value, label }, i) => (
            <motion.div
              key={label}
              className="p-5 rounded-[var(--radius)] flex gap-4 items-start"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                backdropFilter: "blur(12px)",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                className="text-2xl font-display font-bold tabular-nums shrink-0"
                style={{ color: "var(--critical)" }}
              >
                {value}
              </div>
              <div className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                {label}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Leaky prompt demo */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle
              className="w-4 h-4"
              style={{ color: "var(--critical)" }}
              aria-hidden="true"
            />
            <p className="text-sm font-mono" style={{ color: "var(--critical)" }}>
              Real example: this prompt was about to leave your org
            </p>
          </div>
          <TypedLeakyPrompt />
        </motion.div>
      </div>
    </section>
  );
}

// ── Section: How it works ─────────────────────────────────────────────────────

function HowItWorksSection({
  isMobile,
  reducedMotion,
}: {
  isMobile: boolean;
  reducedMotion: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-60px" });
  const [activeStep, setActiveStep] = useState(0);

  const isSticky = !isMobile && !reducedMotion;

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    if (!isSticky) return;
    const unsubscribe = scrollYProgress.on("change", (latest) => {
      const idx = Math.min(
        PIPELINE_STEPS.length - 1,
        Math.floor(latest * PIPELINE_STEPS.length)
      );
      setActiveStep(idx);
    });
    return () => unsubscribe();
  }, [scrollYProgress, isSticky]);

  // Fallback auto-timer if mobile or reduced motion
  useEffect(() => {
    if (isSticky || !isInView) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % PIPELINE_STEPS.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [isSticky, isInView]);

  return (
    <section
      ref={containerRef}
      className={`relative px-6 ${isSticky ? "h-[220vh]" : "py-24 md:py-32"}`}
      style={{ background: "var(--bg)" }}
    >
      {/* Dotted grid background */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(148,163,255,1) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div
        className={`max-w-5xl mx-auto relative ${
          isSticky
            ? "sticky top-16 md:top-20 py-8 min-h-[85vh] flex flex-col justify-center"
            : ""
        }`}
      >
        <motion.div
          className="text-xs font-mono mb-4"
          style={{ color: "var(--primary)" }}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
        >
          02 / HOW WE SEE TRAFFIC
        </motion.div>

        <SplitText
          text="No SSL decryption. No root CA. No MITM."
          as="h2"
          className="font-display font-bold mb-4"
          style={{
            fontSize: "clamp(1.6rem, 3.5vw + 0.5rem, 3rem)",
            color: "var(--text)",
          }}
          delay={0.1}
        />

        <motion.p
          className="max-w-2xl mb-8 text-lg"
          style={{ color: "var(--muted)" }}
          initial={{ opacity: 0, y: 10 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          We use seven legitimate OS-level & network-level sources to surface AI traffic
          without breaking encryption or requiring privileged access.
        </motion.p>

        {/* SVG pipeline */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <PipelineSVG activeStep={activeStep} />
        </motion.div>

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
    delay: 0.06,
  },
  {
    icon: <Activity className="w-5 h-5" aria-hidden="true" />,
    title: "Agent Permission Tracking",
    description:
      "Visualize every shell exec, file read, and tool call an autonomous agent makes. Autonomy score 0–100.",
    tag: "Agents",
    accent: "var(--high)",
    delay: 0.12,
  },
  {
    icon: <Zap className="w-5 h-5" aria-hidden="true" />,
    title: "AI Analyst Triage",
    description:
      "Featherless → Groq → Ollama → rules fallback. Redacts secrets before sending. Shows proof of redaction.",
    tag: "LLM",
    accent: "var(--accent)",
    delay: 0.18,
  },
  {
    icon: <AlertTriangle className="w-5 h-5" aria-hidden="true" />,
    title: "Honeytoken Canaries",
    description:
      "Plant fake API keys, Aadhaar numbers, and DB strings. If they appear in AI traffic → instant critical alert.",
    tag: "Canary",
    accent: "var(--medium)",
    delay: 0.24,
  },
  {
    icon: <Globe className="w-5 h-5" aria-hidden="true" />,
    title: "Opt-in AI Gateway",
    description:
      "Route traffic through localhost:8789 for full payload inspection — and block mode to stop dangerous requests.",
    tag: "Block",
    accent: "var(--primary-2)",
    delay: 0.30,
  },
  {
    icon: <Radio className="w-5 h-5" aria-hidden="true" />,
    title: "Browser Extension",
    description:
      "MV3 content script captures pastes into ChatGPT, Claude, and Gemini — catches what process monitoring can't.",
    tag: "Chrome",
    accent: "#EC4899",
    delay: 0.36,
  },
  {
    icon: <Database className="w-5 h-5" aria-hidden="true" />,
    title: "Compliance Reports",
    description:
      "DPDP Act 2023, GDPR, SOC 2, PCI-DSS, ISO 27001 scorecards with per-control pass/warn/fail. Print to PDF.",
    tag: "PDF",
    accent: "var(--low)",
    delay: 0.42,
  },
];

function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section
      ref={ref}
      className="relative py-24 md:py-32 px-6"
      style={{ background: "var(--bg-2)" }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(139,92,246,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-5xl mx-auto relative">
        <motion.div
          className="text-xs font-mono mb-4"
          style={{ color: "var(--primary)" }}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
        >
          03 / FEATURES
        </motion.div>

        <SplitText
          text="Everything security needs to tame AI sprawl."
          as="h2"
          className="font-display font-bold mb-12"
          style={{
            fontSize: "clamp(1.6rem, 3.5vw + 0.5rem, 3rem)",
            color: "var(--text)",
          } as React.CSSProperties}
          delay={0.1}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BENTO_TILES.map((tile) => (
            <BentoTile key={tile.title} {...tile} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section: Rogue agent terminal ─────────────────────────────────────────────

function AgentDemoSection({ isMobile }: { isMobile: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section
      ref={ref}
      className="relative py-24 md:py-32 px-6"
      style={{ background: "var(--bg)" }}
    >
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-xs font-mono mb-4"
          style={{ color: "var(--critical)" }}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
        >
          04 / ROGUE AGENT DEMO
        </motion.div>

        <SplitText
          text="Watch ShadowScope intercept a rogue AI agent."
          as="h2"
          className="font-display font-bold mb-4"
          style={{
            fontSize: "clamp(1.6rem, 3.5vw + 0.5rem, 3rem)",
            color: "var(--text)",
          }}
          delay={0.1}
        />

        <motion.p
          className="max-w-2xl mb-10 text-lg"
          style={{ color: "var(--muted)" }}
          initial={{ opacity: 0, y: 10 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          A CrewAI agent attempts to read SSH keys, run a remote shell, and escalate
          privileges. ShadowScope flags and blocks each move in real time.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.45 }}
        >
          <RogueAgentTerminal isMobile={isMobile} />
        </motion.div>

        {/* Try it CTA */}
        <motion.div
          className="mt-8 flex justify-center"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          <Link
            to="/playground"
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-[var(--radius-sm)] transition-all hover:scale-105"
            style={{
              background: "rgba(255,59,92,0.12)",
              color: "var(--critical)",
              border: "1px solid rgba(255,59,92,0.3)",
            }}
          >
            <Terminal className="w-4 h-4" aria-hidden="true" />
            Scan your own prompts in the Playground
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

// ── Section: Privacy promise ──────────────────────────────────────────────────

function PrivacySection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

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
      ref={ref}
      className="relative py-24 md:py-32 px-6"
      style={{ background: "var(--bg-2)" }}
    >
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-xs font-mono mb-4"
          style={{ color: "var(--primary)" }}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
        >
          05 / PRIVACY PROMISE
        </motion.div>

        <SplitText
          text="We guard your secrets as carefully as we catch them."
          as="h2"
          className="font-display font-bold mb-12"
          style={{
            fontSize: "clamp(1.6rem, 3.5vw + 0.5rem, 3rem)",
            color: "var(--text)",
          } as React.CSSProperties}
          delay={0.1}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {promises.map(({ icon, title, desc, color }, i) => (
            <motion.div
              key={title}
              className="flex gap-4 p-5 rounded-[var(--radius)]"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                backdropFilter: "blur(12px)",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0"
                style={{ background: `${color}18`, color }}
              >
                {icon}
              </div>
              <div>
                <h3 className="font-display font-semibold mb-1 text-sm" style={{ color: "var(--text)" }}>
                  {title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  {desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section: Final CTA ────────────────────────────────────────────────────────

function FinalCTASection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      ref={ref}
      className="relative py-28 md:py-40 px-6 overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* Glow radial */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(34,211,238,0.1) 0%, transparent 65%)",
        }}
      />

      <div className="max-w-3xl mx-auto text-center relative">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2
            className="font-display font-bold mb-6"
            style={{
              fontSize: "clamp(2rem, 4vw + 0.5rem, 3.5rem)",
              color: "var(--text)",
            }}
          >
            See every AI conversation.{" "}
            <span style={{ color: "var(--primary)" }}>Stop every leak.</span>
          </h2>

          <p className="mb-10 text-lg" style={{ color: "var(--muted)" }}>
            No TLS decryption. No invasive proxies. No agents to deploy.{" "}
            <br className="hidden md:block" />
            Just run ShadowScope and finally know what AI is doing inside your org.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <MagneticButton href="/app" className="group">
              <div
                className="flex items-center gap-2 px-8 py-4 rounded-[var(--radius-sm)] font-bold text-base transition-all"
                style={{
                  background: "var(--primary)",
                  color: "#05060A",
                  boxShadow: "0 0 32px rgba(34,211,238,0.45), 0 4px 20px rgba(34,211,238,0.25)",
                }}
              >
                <Terminal className="w-5 h-5" aria-hidden="true" />
                Open the Console
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
              </div>
            </MagneticButton>
            <MagneticButton href="/playground">
              <div
                className="flex items-center gap-2 px-8 py-4 rounded-[var(--radius-sm)] font-bold text-base"
                style={{
                  background: "transparent",
                  color: "var(--text)",
                  border: "1px solid var(--border-strong)",
                }}
              >
                <Zap className="w-5 h-5" aria-hidden="true" />
                Try the Playground
              </div>
            </MagneticButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      className="relative py-10 px-6"
      style={{
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="font-display font-bold" style={{ color: "var(--text)" }}>
            Shadow<span style={{ color: "var(--primary)" }}>Scope</span>
          </span>
        </div>

        {/* Team credit */}
        <div className="text-center">
          <p className="text-sm font-mono" style={{ color: "var(--muted)" }}>
            Built by{" "}
            <span className="font-bold" style={{ color: "var(--primary)" }}>
              git push n pray
            </span>{" "}
            at{" "}
            <span style={{ color: "var(--accent)" }}>Hacktoberfest @ CBIT</span>
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--faint)" }}>
            Team 10 · 16-hour hackathon · 2026
          </p>
        </div>

        {/* Links */}
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/31Pritika/HFT26-TEAM-10"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm transition-colors hover:text-primary"
            style={{ color: "var(--muted)" }}
            aria-label="GitHub repository"
          >
            <GithubIcon className="w-4 h-4" />
            GitHub
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
          <Link
            to="/architecture"
            className="text-sm transition-colors hover:text-primary"
            style={{ color: "var(--muted)" }}
          >
            Architecture
          </Link>
          <Link
            to="/report"
            className="text-sm transition-colors hover:text-primary"
            style={{ color: "var(--muted)" }}
          >
            Report
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ── Main Landing component ────────────────────────────────────────────────────

export default function Landing() {
  const webGLSupported = useWebGL();
  const reducedMotion = useReducedMotion();
  const isMobile = useMobile();

  // Lenis smooth scroll — desktop only, not reduced-motion
  useLenis(!reducedMotion && !isMobile);

  // Set document title
  useEffect(() => {
    document.title = "ShadowScope — AI Shadow IT & Agentic Data Exfiltration Scanner";
  }, []);

  return (
    <>
      <ScrollProgressBar />
      <CursorGlow />

      <main id="main-content">
        <HeroSection
          webGLSupported={webGLSupported}
          reducedMotion={reducedMotion}
          isMobile={isMobile}
        />
        <ProblemSection />
        <HowItWorksSection
          isMobile={isMobile}
          reducedMotion={reducedMotion}
        />
        <FeaturesSection />
        <AgentDemoSection isMobile={isMobile} />
        <PrivacySection />
        <FinalCTASection />
      </main>

      <Footer />
    </>
  );
}
