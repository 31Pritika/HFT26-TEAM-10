import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  Check,
  Sparkles,
  Lock,
  Cpu,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  Gauge,
  Layers,
  FileCheck2,
} from "lucide-react";
import { api } from "../../shared/api";
import {
  GlassCard,
  Badge,
  SeverityPill,
  Button,
  Skeleton,
} from "../../shared/ui";
import type { Finding, TriageResult } from "../../shared/types";
import { toast } from "sonner";

export default function AlertDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [triageData, setTriageData] = useState<TriageResult | null>(null);
  const [isTriaging, setIsTriaging] = useState(false);
  const [triageEngine, setTriageEngine] = useState<"auto" | "featherless" | "groq" | "ollama" | "rules">("auto");
  const [proofExpanded, setProofExpanded] = useState(false);
  const [checkedRemediations, setCheckedRemediations] = useState<Set<number>>(new Set());
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  // Typewriter effect state
  const [typewriterText, setTypewriterText] = useState("");
  const typewriterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch finding detail
  const { data: findingDetail, isLoading, error } = useQuery({
    queryKey: ["finding", id],
    queryFn: () => (id ? api.getFinding(id) : Promise.reject("No ID")),
    enabled: Boolean(id),
  });

  const finding = findingDetail as (Finding & { event: unknown }) | undefined;

  // Initialize triageData from finding if already triaged
  useEffect(() => {
    if (finding?.triage && !triageData) {
      setTriageData(finding.triage);
      setTypewriterText(finding.triage.reasoning);
    }
  }, [finding?.triage, triageData]);

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: (newStatus: Finding["status"]) => {
      if (!id) throw new Error("No finding ID");
      return api.updateFinding(id, newStatus);
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["finding", id] });
      queryClient.invalidateQueries({ queryKey: ["findings"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast.success(`Alert status changed to "${newStatus}"`);
    },
    onError: () => {
      toast.error("Failed to update status");
    },
  });

  // Typewriter reveal function
  const runTypewriter = (fullText: string) => {
    if (typewriterTimerRef.current) clearTimeout(typewriterTimerRef.current);
    setTypewriterText("");
    let currentIdx = 0;
    const speed = Math.max(10, Math.floor(1200 / fullText.length));

    const step = () => {
      if (currentIdx < fullText.length) {
        currentIdx += Math.min(3, fullText.length - currentIdx);
        setTypewriterText(fullText.slice(0, currentIdx));
        typewriterTimerRef.current = setTimeout(step, speed);
      }
    };
    step();
  };

  // Run AI triage
  const handleRunTriage = async () => {
    if (!id) return;
    setIsTriaging(true);
    setTriageData(null);
    setTypewriterText("");

    try {
      const res = await api.triageFinding(id, triageEngine);
      setTriageData(res);
      setIsTriaging(false);
      runTypewriter(res.reasoning);
      toast.success("AI Analyst analysis complete");
    } catch {
      setIsTriaging(false);
      toast.error("Failed to consult AI Analyst");
    }
  };

  const toggleRemediation = (index: number) => {
    setCheckedRemediations((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const copyFingerprint = (fp: string) => {
    navigator.clipboard.writeText(fp);
    setCopiedFingerprint(true);
    setTimeout(() => setCopiedFingerprint(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !finding) {
    return (
      <div className="max-w-2xl mx-auto p-12 text-center">
        <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-text">Alert Not Found</h2>
        <p className="text-xs text-muted mt-1">
          Finding with ID &ldquo;{id}&rdquo; does not exist or has been archived.
        </p>
        <Button variant="secondary" size="sm" onClick={() => navigate("/app/alerts")} className="mt-4">
          <ArrowLeft className="w-4 h-4" /> Back to Alerts Center
        </Button>
      </div>
    );
  }

  const isCritical = finding.severity === "critical";
  const evidence = finding.evidence;
  const entropy = evidence?.entropy ?? null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Back button link */}
      <div>
        <button
          onClick={() => navigate("/app/alerts")}
          className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-cyan-400 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Alerts Center</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 1. SEVERITY HERO BAND                                                */}
      {/* ==================================================================== */}
      <div
        className={`rounded-2xl border p-5 sm:p-6 backdrop-blur-xl relative overflow-hidden ${
          isCritical
            ? "border-red-500/40 bg-gradient-to-r from-red-950/40 via-surface/90 to-surface/90 shadow-[0_0_35px_rgba(255,59,92,0.2)]"
            : finding.severity === "high"
            ? "border-orange-500/35 bg-gradient-to-r from-orange-950/30 via-surface/90 to-surface/90"
            : "border-cyan-500/30 bg-gradient-to-r from-cyan-950/30 via-surface/90 to-surface/90"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <SeverityPill severity={finding.severity} size="sm" pulse={isCritical} />
              <span className="font-mono text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/25">
                {finding.id}
              </span>
              <span className="font-mono text-xs text-muted">
                {new Date(finding.ts).toLocaleString()}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase font-mono ${
                  finding.status === "open"
                    ? "bg-red-500/20 text-red-300 border border-red-500/40"
                    : finding.status === "acknowledged"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                }`}
              >
                Status: {finding.status}
              </span>
            </div>

            <h1 className="font-display text-xl sm:text-2xl font-bold text-text leading-tight">
              {finding.title}
            </h1>
            <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-3xl">
              {finding.description}
            </p>
          </div>

          {/* Quick status actions */}
          <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
            {finding.status !== "resolved" && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => statusMutation.mutate("resolved")}
                loading={statusMutation.isPending}
                magnetic
              >
                <Check className="w-4 h-4" />
                Resolve Alert
              </Button>
            )}
            {finding.status === "open" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => statusMutation.mutate("acknowledged")}
                loading={statusMutation.isPending}
              >
                Acknowledge
              </Button>
            )}
            {finding.status !== "false_positive" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => statusMutation.mutate("false_positive")}
                loading={statusMutation.isPending}
              >
                False Positive
              </Button>
            )}
          </div>
        </div>

        {/* Metadata Badges strip */}
        <div className="mt-4 pt-4 border-t border-white/[0.08] flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-muted">
            <span className="text-muted/60">Type:</span>
            <Badge variant="mono" size="xs">
              {finding.type}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-muted">
            <span className="text-muted/60">Subtype:</span>
            <Badge variant="cyan" size="xs">
              {finding.subtype}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-muted">
            <span className="text-muted/60">Detector:</span>
            <Badge variant="violet" size="xs">
              {finding.detector}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-muted">
            <span className="text-muted/60">Confidence:</span>
            <span className="font-bold text-text">
              {Math.round(finding.confidence * 100)}%
            </span>
          </div>

          {finding.event_id && (
            <button
              onClick={() => navigate(`/app/live`)}
              className="ml-auto inline-flex items-center gap-1 text-cyan-400 hover:underline cursor-pointer"
            >
              <span>Linked Event {finding.event_id}</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. EVIDENCE INSPECTION BLOCK                                         */}
      {/* ==================================================================== */}
      <GlassCard variant="default" className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-cyan-400" />
            <h3 className="font-display text-base font-bold text-text">
              Exfiltration Evidence & Payload Analysis
            </h3>
          </div>
          <span className="font-mono text-xs text-muted">
            Target Match Automatically Redacted
          </span>
        </div>

        {/* Highlighted Match Box */}
        <div className="relative rounded-xl border border-white/10 bg-[#060812] p-4 font-mono text-xs leading-relaxed overflow-x-auto">
          <div className="text-muted/60 text-[10px] uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Redacted Snippet Captured</span>
            {evidence?.fingerprint && (
              <button
                onClick={() => copyFingerprint(evidence.fingerprint!)}
                className="flex items-center gap-1 text-muted hover:text-cyan-400 transition-colors"
                title="Copy SHA-256 fingerprint"
              >
                <Fingerprint className="w-3.5 h-3.5" />
                <span>SHA-256: {evidence.fingerprint}</span>
                {copiedFingerprint && <span className="text-emerald-400 font-bold">Copied!</span>}
              </button>
            )}
          </div>

          <pre className="text-text whitespace-pre-wrap font-mono text-xs bg-black/40 p-3 rounded-lg border border-white/5">
            {evidence?.redacted_snippet ? (
              evidence.redacted_snippet.split(evidence.match_redacted).map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && (
                    <mark className="bg-red-500/30 text-red-300 font-bold px-1.5 py-0.5 rounded border border-red-500/40">
                      {evidence.match_redacted}
                    </mark>
                  )}
                </span>
              ))
            ) : (
              <span className="italic text-muted">Snippet not available</span>
            )}
          </pre>
        </div>

        {/* Entropy Meter & Offset Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 font-mono text-xs">
          {/* Shannon Entropy Bar */}
          <div className="rounded-xl border border-white/[0.06] bg-surface-solid/60 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-muted text-[11px] flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Shannon Entropy
              </span>
              <span className="font-bold text-text">
                {entropy !== null ? entropy.toFixed(2) : "N/A"}
              </span>
            </div>
            {entropy !== null ? (
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    entropy >= 4.0 ? "bg-red-400 shadow-[0_0_8px_rgba(255,59,92,0.8)]" : "bg-cyan-400"
                  }`}
                  style={{ width: `${Math.min(100, (entropy / 6) * 100)}%` }}
                />
              </div>
            ) : (
              <span className="text-[10px] text-muted/60">Regex Pattern Match</span>
            )}
          </div>

          {/* Line & Offset */}
          <div className="rounded-xl border border-white/[0.06] bg-surface-solid/60 p-3 flex flex-col justify-between">
            <span className="text-muted text-[11px]">Payload Offset</span>
            <div className="flex items-center gap-3 text-text font-bold mt-1">
              <span>Line {evidence?.line ?? 1}</span>
              <span className="text-muted/40">|</span>
              <span>Byte Offset {evidence?.offset ?? 0}</span>
            </div>
          </div>

          {/* Regulatory Compliance Mappings */}
          <div className="rounded-xl border border-white/[0.06] bg-surface-solid/60 p-3 flex flex-col justify-between">
            <span className="text-muted text-[11px]">Impacted Compliance</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {finding.compliance?.map((c) => (
                <span
                  key={c}
                  className="px-2 py-0.5 rounded bg-surface border border-cyan-500/30 text-cyan-300 font-bold text-[10px]"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ==================================================================== */}
      {/* 3. PROCESS & PROVIDER CORRELATION CARDS                              */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Process Card */}
        <GlassCard variant="default" className="p-5 space-y-3 font-mono text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-white/[0.08]">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h4 className="font-display text-sm font-bold text-text">Process Context</h4>
          </div>
          <div className="grid grid-cols-2 gap-2 text-muted">
            <div>
              <span className="text-[10px] uppercase text-muted/60 block">Process</span>
              <span className="text-text font-semibold">{finding.process_name ?? "Unknown"}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-muted/60 block">Provider ID</span>
              <span className="text-text">{finding.provider_id ?? "Direct API"}</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-white/[0.06] text-muted">
            <span className="text-[10px] uppercase text-muted/60 block">Status</span>
            <span className="text-amber-400">Unmonitored Local Execution</span>
          </div>
        </GlassCard>

        {/* Compliance & Governance Checklist Card */}
        <GlassCard variant="default" className="p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-emerald-400" />
              <h4 className="font-display text-sm font-bold text-text">Remediation Checklist</h4>
            </div>
            <span className="font-mono text-[10px] text-muted">
              {checkedRemediations.size} of {finding.remediation.length} completed
            </span>
          </div>

          <div className="space-y-2">
            {finding.remediation.map((step, idx) => {
              const isDone = checkedRemediations.has(idx);
              return (
                <div
                  key={idx}
                  onClick={() => toggleRemediation(idx)}
                  className={`flex items-start gap-2.5 p-2 rounded-lg border transition-colors cursor-pointer select-none text-xs ${
                    isDone
                      ? "bg-emerald-950/20 border-emerald-500/30 text-muted line-through"
                      : "bg-surface-solid/60 border-white/[0.06] text-text hover:bg-surface-solid"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => {}}
                    className="mt-0.5 rounded border-white/20 bg-white/5 text-emerald-400 focus:ring-0 cursor-pointer"
                  />
                  <span className="leading-relaxed">{step}</span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      {/* ==================================================================== */}
      {/* 4. "ASK AI ANALYST" CINEMATIC TRIAGE SECTION                         */}
      {/* ==================================================================== */}
      <GlassCard
        variant="default"
        glow={triageData ? "violet" : "none"}
        className="p-5 sm:p-6 space-y-5 relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/20 text-violet-400 border border-violet-500/30">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="font-display text-base font-bold text-text">
                ShadowScope AI Security Analyst
              </h3>
            </div>
            <p className="text-xs text-muted mt-1">
              On-device reasoning engine. Secrets are mathematically masked before submission.
            </p>
          </div>

          {/* Engine selector and triage trigger */}
          <div className="flex items-center gap-2">
            <select
              value={triageEngine}
              onChange={(e) => setTriageEngine(e.target.value as typeof triageEngine)}
              disabled={isTriaging}
              className="bg-[#080c18] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-violet-400 font-mono"
            >
              <option value="auto">Auto (Best Available)</option>
              <option value="featherless">Featherless Cloud LLM</option>
              <option value="groq">Groq Fast Inference</option>
              <option value="ollama">Ollama (100% Local)</option>
              <option value="rules">Rules Fallback</option>
            </select>

            <Button
              variant="primary"
              size="sm"
              onClick={handleRunTriage}
              loading={isTriaging}
              magnetic
            >
              <Sparkles className="w-4 h-4" />
              {triageData ? "Re-Analyze Alert" : "Ask AI Analyst"}
            </Button>
          </div>
        </div>

        {/* In-Flight Scanning Shimmer Animation */}
        {isTriaging && (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
              <Sparkles className="w-6 h-6 text-violet-400 animate-pulse" />
            </div>
            <div>
              <p className="font-display font-semibold text-text text-sm">
                Redacting Tokens & Consulting Intelligence Model...
              </p>
              <p className="font-mono text-xs text-muted mt-0.5">
                Zero raw secrets sent to external endpoint
              </p>
            </div>
          </div>
        )}

        {/* Triage Results Card with Cinematic Reveal */}
        {triageData && !isTriaging && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            {/* Header: Verdict Badge & Engine / Latency Chips */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-white/[0.08] bg-surface-solid/80">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono uppercase text-muted">Verdict:</span>
                <span
                  className={`font-mono text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                    triageData.verdict === "true_positive"
                      ? "bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_12px_rgba(255,59,92,0.3)]"
                      : triageData.verdict === "likely_false_positive"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  }`}
                >
                  {triageData.verdict.replace(/_/g, " ")}
                </span>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs text-muted">
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-violet-300">
                  {triageData.engine} ({triageData.model})
                </span>
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-300">
                  {triageData.latency_ms}ms
                </span>
              </div>
            </div>

            {/* Typewriter Reasoning Box */}
            <div className="p-4 rounded-xl border border-white/10 bg-[#070a16] space-y-2">
              <span className="text-[10px] font-mono uppercase text-muted/70 tracking-wider block">
                Analyst Reasoning
              </span>
              <p className="font-sans text-sm text-text leading-relaxed font-normal min-h-[3rem]">
                {typewriterText}
              </p>
            </div>

            {/* Policy Suggestion Card */}
            {triageData.policy_suggestion && (
              <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-950/15 space-y-1">
                <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold font-mono">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Recommended Governance Policy Update
                </div>
                <p className="text-xs text-text/90 leading-relaxed font-mono">
                  {triageData.policy_suggestion}
                </p>
              </div>
            )}

            {/* Collapsible Privacy Proof Box */}
            <div className="border border-white/10 rounded-xl overflow-hidden bg-[#060812]">
              <button
                onClick={() => setProofExpanded(!proofExpanded)}
                className="w-full flex items-center justify-between p-3.5 text-xs font-mono text-muted hover:text-text transition-colors bg-white/[0.02]"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-text">
                    Privacy Proof: What was sent to the LLM
                  </span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold">
                    Zero-Exposure Verified
                  </span>
                </div>
                {proofExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              <AnimatePresence>
                {proofExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-4 border-t border-white/[0.08] text-xs font-mono space-y-2 text-muted"
                  >
                    <p className="text-[11px] leading-relaxed text-muted/80">
                      Before sending this snippet to the intelligence engine, ShadowScope&apos;s on-device
                      regex scrubber replaced all secrets and customer identifiers with cryptographic hashes
                      or redacted placeholders.
                    </p>
                    <pre className="p-3 bg-black/60 rounded border border-white/5 text-[11px] text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                      {triageData.redacted_input_preview}
                    </pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </GlassCard>
    </div>
  );
}
