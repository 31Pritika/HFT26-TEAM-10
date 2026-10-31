import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ShieldAlert,
  ArrowLeft,
  Terminal,
  Home,
  LayoutDashboard,
  FlaskConical,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export default function NotFound() {
  const location = useLocation();
  const [runningDiag, setRunningDiag] = useState(false);
  const [diagComplete, setDiagComplete] = useState(false);

  useEffect(() => {
    document.title = "Page Not Found · ShadowScope";
  }, []);

  const handleRunDiag = () => {
    setRunningDiag(true);
    setDiagComplete(false);
    setTimeout(() => {
      setRunningDiag(false);
      setDiagComplete(true);
    }, 900);
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-bg text-text p-4 sm:p-6 overflow-hidden selection:bg-primary/20 selection:text-primary">
      {/* Background Cyber Grid & Vignette */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:32px_32px]"
      />

      <div className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center text-center">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-danger/30 bg-danger/10 text-xs text-text mb-6">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>STATUS: UNKNOWN_ENDPOINT_DETECTED</span>
        </div>

        {/* Big Glitch 404 */}
        <div className="relative font-display font-semibold text-7xl sm:text-9xl tracking-tighter select-none my-2 text-transparent bg-clip-text bg-text from-text via-text/80 to-muted/40">
          <span>404</span>
          {/* Cyber chromatic aberration layer */}
          <span
            aria-hidden="true"
            className="absolute inset-0 text-primary translate-x-[2px] translate-y-[-1px] blur-[1px] pointer-events-none"
          >
            404
          </span>
          <span
            aria-hidden="true"
            className="absolute inset-0 text-danger -translate-x-[2px] translate-y-[1px] blur-[1px] pointer-events-none"
          >
            404
          </span>
        </div>

        {/* Spec Headline */}
        <h1 className="font-display text-xl sm:text-3xl font-semibold tracking-tight text-text mt-2 mb-3">
          This endpoint isn't in our fingerprint DB
        </h1>

        <p className="text-sm sm:text-base text-muted max-w-lg mb-8 leading-relaxed font-sans">
          The requested coordinate{" "}
          <code className="px-2 py-0.5 rounded border border-border bg-surface-solid text-primary font-mono text-xs">
            {location.pathname}
          </code>{" "}
          was intercepted by the ShadowScope packet monitor. No registered AI model, provider route, or internal endpoint matched this signature.
        </p>

        {/* Terminal Diagnostics Card */}
        <div className="w-full text-left rounded-xl border border-border bg-bg-2/95 p-4 sm:p-5 text-xs mb-8 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3 text-muted">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px]">ShadowScope Kernel Inspection</span>
            </div>
            <span className="text-[11px] text-muted">dns / sni probe</span>
          </div>

          <div className="space-y-1.5 text-muted leading-relaxed">
            <div>
              <span className="text-primary">[TRACE]</span> Target URI:{" "}
              <span className="text-text">{location.pathname}</span>
            </div>
            <div>
              <span className="text-primary">[RADAR]</span> Matching against AI provider fingerprints…
            </div>
            <div className="text-muted pl-4 border-l border-border/50 text-[11px]">
              - OpenAI (api.openai.com, chatgpt.com) : NO MATCH
              <br />
              - Anthropic (api.anthropic.com, claude.ai) : NO MATCH
              <br />
              - Ollama / Local LLM (:11434, :1234) : NO MATCH
              <br />
              - Hugging Face / Groq / DeepSeek : NO MATCH
            </div>
            <div>
              <span className="text-amber-400">[RESULT]</span> Fingerprint mismatch (0 signatures verified).
            </div>

            {diagComplete && (
              <div className="pt-2 text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Kernel probe completed. Sanctioned routes are available below.</span>
              </div>
            )}
          </div>

          {/* Diagnostic Button */}
          <div className="mt-4 pt-3 border-t border-border flex justify-end">
            <button
              onClick={handleRunDiag}
              disabled={runningDiag}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-solid text-[11px] text-text transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 text-primary ${runningDiag ? "animate-spin" : ""}`} />
              <span>{runningDiag ? "Probing Kernel Tap…" : "Re-run Diagnostic Probe"}</span>
            </button>
          </div>
        </div>

        {/* Sanctioned Route CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3 w-full">
          <Link
            to="/"
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors hover:shadow-primary/20"
          >
            <Home className="h-4 w-4" />
            <span>Return Home</span>
          </Link>

          <Link
            to="/app"
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-solid text-text text-xs font-semibold transition-colors"
          >
            <LayoutDashboard className="h-4 w-4 text-accent" />
            <span>Open Threat Console</span>
          </Link>

          <Link
            to="/playground"
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-solid text-text text-xs font-semibold transition-colors"
          >
            <FlaskConical className="h-4 w-4 text-amber-400" />
            <span>Threat Playground</span>
          </Link>
        </div>

        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-text transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Back to previous coordinates</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
