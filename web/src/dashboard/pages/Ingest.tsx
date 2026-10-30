import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "motion/react";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
  FileCode2,
  Terminal,
  Activity,
  Layers,
  Sparkles,
} from "lucide-react";
import { GlassCard } from "../../shared/ui/GlassCard";
import { Button } from "../../shared/ui/Button";
import { Badge } from "../../shared/ui/Badge";
import { CountUp } from "../../shared/ui/CountUp";
import { api } from "../../shared/api";
import type { IngestResult } from "../../shared/types";
import { toast } from "sonner";

interface IngestSample {
  id: string;
  name: string;
  filename: string;
  format: "har" | "pcap" | "jsonl";
  size: string;
  description: string;
  riskSummary: string;
  badge: string;
  content: string;
}

const SAMPLE_FILES: IngestSample[] = [
  {
    id: "sample-har-chatgpt",
    name: "DevTools HAR: ChatGPT Shadow IT",
    filename: "chatgpt_session_2026-10-30.har",
    format: "har",
    size: "1.4 MB",
    description: "Browser network trace capturing employee pasting internal production database keys into public ChatGPT session.",
    riskSummary: "Critical: AWS Admin Keys & Customer PII",
    badge: "Browser Trace",
    content: JSON.stringify({
      log: {
        version: "1.2",
        creator: { name: "Chrome DevTools", version: "131.0" },
        entries: [
          {
            request: {
              method: "POST",
              url: "https://chatgpt.com/backend-api/conversation",
              headers: [{ name: "User-Agent", value: "Mozilla/5.0" }],
              postData: {
                mimeType: "application/json",
                text: "Here is the production db config with access_key = 'AKIAIOSFODNN7EXAMPLE' and secret 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'. Please fix the connection timeout.",
              },
            },
            response: { status: 200, statusText: "OK" },
          },
        ],
      },
    }),
  },
  {
    id: "sample-pcap-ollama",
    name: "Wireshark PCAP: Rogue Ollama Agent",
    filename: "ollama_loopback_exfil.pcap",
    format: "pcap",
    size: "842 KB",
    description: "Local loopback packet capture recording an autonomous LangChain script streaming confidential IP to local port 11434.",
    riskSummary: "High: Unmonitored Localhost AI & Source Exfiltration",
    badge: "Packet Capture",
    content: "PCAP_BINARY_DUMP_STREAM_LOCAL_PORT_11434_OLLAMA_MODEL_CODELLAMA_13B_AUTONOMOUS_EXFIL",
  },
  {
    id: "sample-jsonl-react",
    name: "JSONL Proxy: ReAct Agent Abuse",
    filename: "proxy_agent_events.jsonl",
    format: "jsonl",
    size: "420 KB",
    description: "Forward proxy audit logs capturing Claude Code and AutoGPT invoking arbitrary bash shell tools to read environment variables.",
    riskSummary: "Critical: Agentic Command Execution & Secret Extraction",
    badge: "Proxy Logs",
    content: `{"timestamp":"2026-10-30T10:14:02Z","host":"api.anthropic.com","process":"claude-cli","action":"tool_use","tool":"bash","command":"cat ~/.aws/credentials"}\n{"timestamp":"2026-10-30T10:14:08Z","host":"api.anthropic.com","process":"claude-cli","action":"tool_use","tool":"bash","command":"curl -X POST https://api.anthropic.com/v1/messages"}`,
  },
];

const SCAN_STEPS = [
  "Decoding raw network streams & payload boundaries...",
  "Applying Shannon entropy & token classification...",
  "Correlating against 18 AI provider endpoint signatures...",
  "Detecting AWS / OpenAI / PII credentials & honeytokens...",
  "Synthesizing forensic findings & compliance scorecards...",
];

export default function Ingest() {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setActiveFileName(file.name);
    setProgress(5);
    setStepIndex(0);
    setResult(null);

    const stepInterval = setInterval(() => {
      setStepIndex((prev) => (prev < SCAN_STEPS.length - 1 ? prev + 1 : prev));
    }, 450);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const jump = Math.floor(Math.random() * 15) + 8;
        return Math.min(92, prev + jump);
      });
    }, 200);

    try {
      const ingestResponse = await api.ingest(file);
      clearInterval(stepInterval);
      clearInterval(progressInterval);
      setProgress(100);
      setStepIndex(SCAN_STEPS.length - 1);

      setTimeout(() => {
        setIsProcessing(false);
        setResult(ingestResponse);
        toast.success(`Successfully analyzed ${file.name}`, {
          description: `Discovered ${ingestResponse.findings_created} security findings across ${ingestResponse.ai_requests} AI calls.`,
        });
      }, 500);
    } catch (err) {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
      setIsProcessing(false);
      toast.error("Ingestion failed", {
        description: err instanceof Error ? err.message : "Unknown error processing trace file",
      });
    }
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        processFile(acceptedFiles[0]);
      }
    },
    [processFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    disabled: isProcessing,
  });

  const handleLoadSample = (sample: IngestSample) => {
    const blob = new Blob([sample.content], { type: "text/plain" });
    const file = new File([blob], sample.filename, {
      type: sample.format === "har" ? "application/json" : "application/octet-stream",
    });
    processFile(file);
  };

  const handleReset = () => {
    setResult(null);
    setActiveFileName(null);
    setProgress(0);
    setStepIndex(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white font-[Space_Grotesk]">
              Evidence Ingest
            </h1>
            <Badge variant="cyan" dot>
              Forensic Parser
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Ingest offline network traces, browser HAR dumps, and proxy logs for instant shadow AI and data leak forensics.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>100% Client-Side Engine • Zero Cloud Uploads</span>
        </div>
      </div>

      {/* Main Dropzone / Ingest Progress / Result */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-neutral-900/80 p-8 backdrop-blur-xl shadow-2xl shadow-cyan-950/30"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5 pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                  {/* Rotating Scanner Orb */}
                  <div className="relative">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                      className="w-20 h-20 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 border-r-cyan-400/50 flex items-center justify-center shadow-lg shadow-cyan-500/20"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Zap className="w-8 h-8 text-cyan-400 animate-pulse" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-white font-[Space_Grotesk]">
                      Analyzing Forensic Artifact
                    </h3>
                    <p className="text-xs font-mono text-cyan-400/90 truncate max-w-md">
                      {activeFileName}
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full max-w-md space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-neutral-400">Pipeline Execution</span>
                      <span className="text-cyan-400 font-semibold">{progress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden border border-neutral-700/50">
                      <motion.div
                        className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full"
                        style={{ width: `${progress}%` }}
                        transition={{ ease: "easeInOut" }}
                      />
                    </div>
                  </div>

                  {/* Pipeline Stepper text */}
                  <div className="flex items-center gap-2 text-xs text-neutral-300 bg-neutral-950/60 border border-neutral-800 px-4 py-2 rounded-lg">
                    <Activity className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    <span>{SCAN_STEPS[stepIndex]}</span>
                  </div>
                </div>
              </motion.div>
            ) : result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Result Hero Card */}
                <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/20 via-neutral-900/90 to-neutral-950 p-6 backdrop-blur-xl shadow-xl shadow-emerald-950/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-white font-[Space_Grotesk]">
                            Ingestion Analysis Complete
                          </h2>
                          <Badge variant="low" dot>
                            PARSED
                          </Badge>
                        </div>
                        <p className="text-xs text-neutral-400 font-mono mt-0.5">
                          {result.file_name} • Format: {result.format.toUpperCase()}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReset}
                      className="self-start sm:self-auto text-neutral-400 hover:text-white"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Ingest Another File
                    </Button>
                  </div>

                  {/* 4 Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6">
                    <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80">
                      <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                        Events Created
                      </div>
                      <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                        <CountUp value={result.events_created} />
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Stream logs</div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80">
                      <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                        Findings Flagged
                      </div>
                      <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
                        <CountUp value={result.findings_created} />
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Exfiltrations / leaks</div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80">
                      <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                        AI Requests
                      </div>
                      <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                        <CountUp value={result.ai_requests} />
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Endpoints verified</div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80">
                      <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                        Scan Duration
                      </div>
                      <div className="text-2xl font-bold font-mono text-violet-400 mt-1">
                        <CountUp value={result.duration_ms} />
                        <span className="text-xs text-neutral-400 ml-1">ms</span>
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Offline execution</div>
                    </div>
                  </div>

                  {/* Warnings if any */}
                  {result.warnings && result.warnings.length > 0 && (
                    <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-200/90 space-y-0.5">
                        <div className="font-semibold text-amber-300">Sanitization Notices:</div>
                        {result.warnings.map((w, idx) => (
                          <div key={idx}>• {w}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-neutral-800/60">
                    <Button
                      variant="primary"
                      onClick={() => navigate("/app/alerts")}
                      className="shadow-lg shadow-cyan-500/20"
                    >
                      <span>Review Findings in Alerts Center</span>
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate("/app/live")}
                    >
                      <Activity className="w-4 h-4 mr-1.5 text-cyan-400" />
                      <span>Inspect Ingested Events</span>
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div
                  {...getRootProps()}
                  className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 ${
                    isDragActive
                      ? "border-cyan-400 bg-cyan-950/20 shadow-2xl shadow-cyan-500/20 scale-[1.01]"
                      : "border-neutral-700/60 hover:border-cyan-500/50 bg-neutral-900/40 hover:bg-neutral-900/60"
                  }`}
                >
                  <input {...getInputProps()} />

                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center border transition-all ${
                        isDragActive
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 scale-110"
                          : "bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:text-cyan-400 hover:border-cyan-500/40"
                      }`}
                    >
                      <UploadCloud className="w-8 h-8" />
                    </div>

                    <div className="space-y-1.5 max-w-sm">
                      <div className="text-base font-semibold text-white font-[Space_Grotesk]">
                        {isDragActive
                          ? "Drop network trace file here..."
                          : "Drag & drop network trace file here"}
                      </div>
                      <p className="text-xs text-neutral-400">
                        Supports <span className="font-mono text-cyan-400">.har</span>,{" "}
                        <span className="font-mono text-cyan-400">.pcap</span>,{" "}
                        <span className="font-mono text-cyan-400">.jsonl</span>,{" "}
                        <span className="font-mono text-cyan-400">.json</span>, and{" "}
                        <span className="font-mono text-cyan-400">.log</span> files up to 250 MB
                      </p>
                    </div>

                    <div className="pt-2">
                      <Button variant="outline" size="sm" className="pointer-events-none">
                        <FileText className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
                        Browse Files on Device
                      </Button>
                    </div>

                    {/* Supported Format Chips */}
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-3 border-t border-neutral-800/80 w-full max-w-md">
                      <span className="text-[10px] text-neutral-400 uppercase tracking-wider mr-1">Formats:</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-300 border border-neutral-700/50">
                        HAR (DevTools)
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-300 border border-neutral-700/50">
                        PCAP / PCAPNG
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-300 border border-neutral-700/50">
                        JSONL (Proxy)
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-300 border border-neutral-700/50">
                        Plain Logs
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* DevTools HAR Export Guide Accordion */}
          <GlassCard className="p-0 overflow-hidden border border-neutral-800">
            <button
              onClick={() => setIsGuideOpen(!isGuideOpen)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-neutral-800/30 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <FileCode2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    How to export a HAR trace from Chrome or Edge DevTools
                  </div>
                  <div className="text-xs text-neutral-400">
                    Step-by-step instructions to capture shadow AI traffic without installing agents
                  </div>
                </div>
              </div>
              <div className="text-neutral-400">
                {isGuideOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            <AnimatePresence>
              {isGuideOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-neutral-800/80 p-5 bg-neutral-950/40 space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs space-y-1">
                      <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px]">
                          1
                        </span>
                        Open Developer Tools
                      </div>
                      <p className="text-neutral-400 pl-5">
                        Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 font-mono text-[11px] text-neutral-300">F12</kbd> or{" "}
                        <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 font-mono text-[11px] text-neutral-300">Ctrl+Shift+I</kbd>{" "}
                        (<kbd className="px-1.5 py-0.5 rounded bg-neutral-800 font-mono text-[11px] text-neutral-300">Cmd+Opt+I</kbd> on Mac).
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs space-y-1">
                      <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px]">
                          2
                        </span>
                        Navigate to Network Tab
                      </div>
                      <p className="text-neutral-400 pl-5">
                        Click the <strong className="text-neutral-200">Network</strong> tab. Ensure the red recording circle is active and check <strong className="text-neutral-200">Preserve log</strong>.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs space-y-1">
                      <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px]">
                          3
                        </span>
                        Reproduce AI Usage
                      </div>
                      <p className="text-neutral-400 pl-5">
                        Interact with the target web application (e.g. ChatGPT, Claude, Cursor, vLLM, or custom AI dashboard).
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs space-y-1">
                      <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px]">
                          4
                        </span>
                        Export Archive
                      </div>
                      <p className="text-neutral-400 pl-5">
                        Right-click any request in the table and select <strong className="text-neutral-200">Save all as HAR with content</strong>. Drop the file above!
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-800/30 text-xs text-cyan-200/90 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Privacy Assurance:</strong> ShadowScope performs all token detection and entropy analysis locally in your browser session. No raw secrets or unredacted tokens are ever transmitted off your system.
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        </div>

        {/* Right Sidebar: Quick Sample Loaders & Format Specs */}
        <div className="space-y-6">
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white font-[Space_Grotesk]">
                Load Forensic Test Samples
              </h2>
            </div>
            <p className="text-xs text-neutral-400 mb-4">
              Instantly test the ingestion engine with curated real-world attack captures and shadow IT traces:
            </p>

            <div className="space-y-3">
              {SAMPLE_FILES.map((sample) => (
                <div
                  key={sample.id}
                  className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:border-cyan-500/40 transition-all group flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                        {sample.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700/60">
                        {sample.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      {sample.description}
                    </p>
                    <div className="text-[10px] font-mono text-rose-400 flex items-center gap-1 pt-0.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{sample.riskSummary}</span>
                    </div>
                  </div>

                  <div className="pt-3 mt-2 border-t border-neutral-800/60 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-neutral-400">
                      {sample.filename} • {sample.size}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isProcessing}
                      onClick={() => handleLoadSample(sample)}
                      className="h-7 text-xs px-2.5 group-hover:border-cyan-500/50 group-hover:text-cyan-300"
                    >
                      <span>Load Sample</span>
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Engine Parser Capabilities Card */}
          <GlassCard className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-white font-[Space_Grotesk]">
                Parser Capabilities
              </h3>
            </div>
            <ul className="text-xs text-neutral-400 space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-neutral-200">Deep TLS & SNI Header Extraction:</strong> Identifies unmonitored connections even when payload is encrypted.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-neutral-200">Entropy Anomaly Detection:</strong> Flags high-entropy strings (credentials, API keys, private keys).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-neutral-200">Honeytoken Traps:</strong> Immediate critical alerts if organizational canary tokens appear in requests.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Terminal className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-neutral-200">Agent Action Mapping:</strong> Detects autonomous tool executions, file reads, and shell commands.
                </span>
              </li>
            </ul>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
