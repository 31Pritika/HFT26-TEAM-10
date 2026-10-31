import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Terminal, Zap, ArrowRight } from "lucide-react";

interface StageLightHeroProps {
  onHowItWorksClick?: () => void;
}

export function StageLightHero({ onHowItWorksClick }: StageLightHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Rising dust particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener("resize", handleResize);

    const particles: {
      x: number;
      y: number;
      radius: number;
      alpha: number;
      speedY: number;
      driftX: number;
      phase: number;
    }[] = [];

    const PARTICLE_COUNT = prefersReduced ? 0 : 28;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.2 + 0.6,
        alpha: Math.random() * 0.18 + 0.05,
        speedY: Math.random() * 0.35 + 0.15,
        driftX: (Math.random() - 0.5) * 0.2,
        phase: Math.random() * Math.PI * 2,
      });
    }

    let t = 0;
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      t += 0.01;
      for (const p of particles) {
        p.y -= p.speedY;
        p.x += Math.sin(t + p.phase) * p.driftX;

        if (p.y < 0) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 242, 236, ${p.alpha})`;
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    if (!prefersReduced) {
      render();
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative min-h-[92vh] flex flex-col justify-between bg-black overflow-hidden select-none">
      {/* Structural Hairline Grid (64px, 4% white, faded out at edges) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, black 20%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, black 20%, transparent 80%)",
        }}
      />

      {/* Stage Spotlights: warm white conic gradients falling from top edge */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Left Spotlight */}
        <div
          className="absolute -top-32 left-1/4 w-[600px] h-[900px] opacity-40 blur-2xl transform -rotate-12 origin-top pointer-events-none motion-safe:animate-[spotlightSwayLeft_11s_ease-in-out_infinite_alternate]"
          style={{
            background:
              "conic-gradient(from 170deg at 50% 0%, transparent 0deg, rgba(255, 255, 255, 0.08) 18deg, rgba(242, 201, 76, 0.03) 30deg, transparent 45deg)",
          }}
        />

        {/* Right Spotlight */}
        <div
          className="absolute -top-32 right-1/4 w-[600px] h-[900px] opacity-40 blur-2xl transform rotate-12 origin-top pointer-events-none motion-safe:animate-[spotlightSwayRight_12s_ease-in-out_infinite_alternate]"
          style={{
            background:
              "conic-gradient(from 190deg at 50% 0%, transparent 0deg, rgba(255, 255, 255, 0.08) 18deg, rgba(242, 201, 76, 0.03) 30deg, transparent 45deg)",
          }}
        />

        {/* Center Stage Pool */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] opacity-25 blur-3xl pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 0%, rgba(255, 255, 255, 0.12) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Canvas for Rising Dust Particles */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />

      {/* Top Navigation */}
      <header className="relative z-20 flex items-center justify-between px-6 py-6 max-w-7xl w-full mx-auto">
        <Link to="/" className="flex items-center gap-2.5 group" aria-label="ShadowScope home">
          <svg className="w-5 h-5 text-primary" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="16" r="2.5" fill="currentColor" />
          </svg>
          <span className="font-display font-medium text-base tracking-tight text-text">
            Shadow<span className="text-primary">Scope</span>
          </span>
        </Link>

        <nav className="flex items-center gap-4">
          {onHowItWorksClick ? (
            <button
              onClick={onHowItWorksClick}
              className="text-xs font-mono text-muted hover:text-text transition-colors cursor-pointer hidden sm:inline"
            >
              How it works
            </button>
          ) : (
            <Link
              to="/architecture"
              className="text-xs font-mono text-muted hover:text-text transition-colors hidden sm:inline"
            >
              How it works
            </Link>
          )}

          <Link
            to="/playground"
            className="text-xs font-mono text-muted hover:text-text transition-colors hidden md:inline"
          >
            Playground
          </Link>

          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border border-border hover:border-border-strong bg-surface text-text hover:text-white transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-primary" />
            <span>Console</span>
          </Link>
        </nav>
      </header>

      {/* Hero Body Content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 sm:px-6 py-20 max-w-4xl mx-auto my-auto">
        {/* Headline with stage light sweep */}
        <h1 className="font-display font-medium text-3xl sm:text-5xl md:text-6xl tracking-tight leading-[1.1] mb-6">
          <span className="block stage-light-sweep font-semibold">
            Your company is talking to AI.
          </span>
          <span className="block text-muted mt-2">
            Do you know what it's saying?
          </span>
        </h1>

        {/* Subtitle */}
        <p className="max-w-2xl text-base sm:text-lg text-muted mb-10 leading-relaxed font-sans">
          ShadowScope discovers shadow AI, catches leaked secrets & PII, and tames rogue
          agents —{" "}
          <span className="text-text font-medium">without breaking TLS.</span>
        </p>

        {/* Action Buttons: Solid primary on black, secondary hairline outline */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Link
            to="/app"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-[var(--radius)] bg-primary text-primary-ink font-semibold text-sm transition-all hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Terminal className="w-4 h-4" />
            <span>Launch Console</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            to="/playground"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-[var(--radius)] bg-surface border border-border hover:border-border-strong text-text hover:text-white text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Zap className="w-4 h-4 text-primary" />
            <span>Try the Playground</span>
          </Link>
        </div>
      </div>

      {/* Hairline Bottom Border */}
      <div className="relative z-10 w-full border-b border-border" />
    </div>
  );
}
