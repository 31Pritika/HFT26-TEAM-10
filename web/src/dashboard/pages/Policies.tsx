import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  KeyRound,
  Sliders,
  Bot,
  Plus,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Info,
  Lock,
} from "lucide-react";
import { api } from "../../shared/api";
import { GlassCard } from "../../shared/ui/GlassCard";
import { Button } from "../../shared/ui/Button";
import { Badge } from "../../shared/ui/Badge";
import { Skeleton } from "../../shared/ui/Skeleton";
import type { Policy, Provider, Severity } from "../../shared/types";
import { toast } from "sonner";

// Shannon entropy calculation: -sum(p * log2(p))
function calculateEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    freq[char] = (freq[char] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const char in freq) {
    const p = freq[char] / len;
    entropy -= p * Math.log2(p);
  }
  return Number(entropy.toFixed(2));
}

const DEFAULT_SAMPLE_TEXT = `const config = {
  appName: "Payment-Gateway-Service",
  environment: "production",
  aws_access_key: "AKIAIOSFODNN7EXAMPLE",
  signing_secret: "c3VwZXJfc2VjcmV0X2tleV8xMjM0NQ==",
  endpoint: "https://api.internal.corp/v1/auth"
};`;

export default function Policies() {
  const queryClient = useQueryClient();

  // Queries
  const { data: initialPolicy, isLoading: isLoadingPolicy } = useQuery({
    queryKey: ["policies"],
    queryFn: () => api.getPolicies(),
  });

  const { data: providersData, isLoading: isLoadingProviders } = useQuery({
    queryKey: ["providers"],
    queryFn: () => api.getProviders(),
  });

  // Local draft state
  const [draft, setDraft] = useState<Policy | null>(null);
  const [newCanaryToken, setNewCanaryToken] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState("");
  const [providerCategory, setProviderCategory] = useState<string>("all");

  // Live entropy testing text
  const [previewText, setPreviewText] = useState(DEFAULT_SAMPLE_TEXT);

  // Initialize draft when data loads
  useEffect(() => {
    if (initialPolicy && !draft) {
      setDraft(JSON.parse(JSON.stringify(initialPolicy)));
    }
  }, [initialPolicy, draft]);

  // Save Mutation
  const updateMutation = useMutation({
    mutationFn: (updated: Partial<Policy>) => api.updatePolicies(updated),
    onSuccess: (savedPolicy) => {
      setDraft(JSON.parse(JSON.stringify(savedPolicy)));
      queryClient.setQueryData(["policies"], savedPolicy);
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Security policies updated successfully", {
        description: "Enforcement rules synchronized across all inspection collectors.",
      });
    },
    onError: (err) => {
      toast.error("Failed to update policy", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    },
  });

  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !initialPolicy) return false;
    return JSON.stringify(draft) !== JSON.stringify(initialPolicy);
  }, [draft, initialPolicy]);

  const handleSave = () => {
    if (!draft) return;
    updateMutation.mutate(draft);
  };

  const handleReset = () => {
    if (initialPolicy) {
      setDraft(JSON.parse(JSON.stringify(initialPolicy)));
      toast.info("Draft reset to active policy");
    }
  };

  // Provider authorization helpers
  const getProviderStatus = (providerId: string): "sanctioned" | "blocked" | "neutral" => {
    if (!draft) return "neutral";
    if (draft.sanctioned_providers.includes(providerId)) return "sanctioned";
    if (draft.blocked_providers.includes(providerId)) return "blocked";
    return "neutral";
  };

  const setProviderStatus = (providerId: string, status: "sanctioned" | "blocked" | "neutral") => {
    if (!draft) return;
    const sanctioned = draft.sanctioned_providers.filter((p) => p !== providerId);
    const blocked = draft.blocked_providers.filter((p) => p !== providerId);

    if (status === "sanctioned") sanctioned.push(providerId);
    if (status === "blocked") blocked.push(providerId);

    setDraft({
      ...draft,
      sanctioned_providers: sanctioned,
      blocked_providers: blocked,
    });
  };

  // Canary Token helpers
  const handleAddCanary = () => {
    if (!draft || !newCanaryToken.trim()) return;
    const token = newCanaryToken.trim();
    if (draft.canary_tokens.includes(token)) {
      toast.error("Canary token already exists");
      return;
    }
    setDraft({
      ...draft,
      canary_tokens: [...draft.canary_tokens, token],
    });
    setNewCanaryToken("");
    toast.success("Canary token added to draft");
  };

  const handleGenerateCanary = () => {
    const randomHex = Array.from({ length: 6 }, () =>
      Math.floor(Math.random() * 16).toString(16).toUpperCase()
    ).join("");
    const generated = `CANARY-SS-${randomHex}`;
    setNewCanaryToken(generated);
  };

  const handleDeleteCanary = (token: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      canary_tokens: draft.canary_tokens.filter((t) => t !== token),
    });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Tokenized live entropy breakdown
  const tokenAnalysis = useMemo(() => {
    const threshold = draft?.entropy_threshold ?? 4.0;
    const words = previewText.split(/([ \t\n\r"';,:=(){}\[\]]+)/);
    let maxEntropy = 0;

    const analyzed = words.map((token, index) => {
      // Skip pure punctuation/whitespace
      const isWhitespaceOrPunctuation = /^[ \t\n\r"';,:=(){}\[\]]+$/.test(token) || token.length < 4;
      if (isWhitespaceOrPunctuation) {
        return { token, entropy: 0, isFlagged: false, key: index };
      }
      const entropy = calculateEntropy(token);
      if (entropy > maxEntropy) maxEntropy = entropy;
      return {
        token,
        entropy,
        isFlagged: entropy >= threshold,
        key: index,
      };
    });

    return { analyzed, maxEntropy };
  }, [previewText, draft?.entropy_threshold]);

  const filteredProviders = useMemo(() => {
    const list: Provider[] = providersData?.items ?? [];
    return list.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(providerSearch.toLowerCase()) ||
        p.id.toLowerCase().includes(providerSearch.toLowerCase()) ||
        p.hosts.some((h) => h.toLowerCase().includes(providerSearch.toLowerCase()));

      const matchesCat = providerCategory === "all" || p.category === providerCategory;
      return matchesSearch && matchesCat;
    });
  }, [providersData?.items, providerSearch, providerCategory]);

  if (isLoadingPolicy || isLoadingProviders || !draft) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Sticky Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white font-display">
              Security Policies &amp; Guardrails
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Configure organizational AI authorization policies, canary honeytokens, entropy sensitivity, and automated triage.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {hasUnsavedChanges && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-sm bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono"
            >
              <Info className="w-3.5 h-3.5 text-amber-400" />
              <span>Unsaved changes</span>
            </motion.div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!hasUnsavedChanges || updateMutation.isPending}
            className="text-neutral-400 hover:text-white"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!hasUnsavedChanges || updateMutation.isPending}
            className=""
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {updateMutation.isPending ? "Saving..." : "Save Policies"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Provider Authorization Matrix & Entropy Engine */}
        <div className="lg:col-span-2 space-y-6">
          {/* Provider Authorization Matrix */}
          <GlassCard className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white font-display">
                    AI Provider Authorization Matrix
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Explicitly sanction approved corporate LLMs or block risky unauthorized models
                  </p>
                </div>
              </div>

              {/* Counts */}
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  {draft.sanctioned_providers.length} Sanctioned
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  {draft.blocked_providers.length} Blocked
                </span>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search provider, host, or id..."
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700/60 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="flex items-center gap-1 flex-wrap pb-1 sm:pb-0 text-xs">
                {(["all", "cloud_llm", "ai_coding", "local_llm", "ai_saas"] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setProviderCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                      providerCategory === cat
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : "bg-neutral-900/60 text-neutral-400 border border-neutral-800 hover:text-white"
                    }`}
                  >
                    {cat === "all" ? "All Types" : cat.replace("_", " ").toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Provider Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
              {filteredProviders.map((provider) => {
                const status = getProviderStatus(provider.id);
                return (
                  <div
                    key={provider.id}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                      status === "sanctioned"
                        ? "bg-emerald-950/20 border-emerald-500/30"
                        : status === "blocked"
                        ? "bg-rose-950/20 border-rose-500/30"
                        : "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">
                          {provider.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800/80 text-neutral-400">
                          {provider.category.replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-neutral-400 truncate">
                        {provider.hosts.join(", ")}
                      </div>
                    </div>

                    {/* 3-State Toggle */}
                    <div className="flex items-center gap-1.5 pt-3 mt-2 border-t border-neutral-800/60">
                      <button
                        onClick={() => setProviderStatus(provider.id, "sanctioned")}
                        className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[11px] font-medium transition-all ${
                          status === "sanctioned"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                            : "bg-neutral-800/50 text-neutral-400 hover:text-emerald-300"
                        }`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>Sanction</span>
                      </button>

                      <button
                        onClick={() => setProviderStatus(provider.id, "neutral")}
                        className={`px-2 py-1 rounded text-[11px] transition-all ${
                          status === "neutral"
                            ? "bg-neutral-800 text-neutral-200 border border-neutral-700 font-semibold"
                            : "bg-neutral-900/50 text-neutral-400 hover:text-white"
                        }`}
                      >
                        Neutral
                      </button>

                      <button
                        onClick={() => setProviderStatus(provider.id, "blocked")}
                        className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[11px] font-medium transition-all ${
                          status === "blocked"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold"
                            : "bg-neutral-800/50 text-neutral-400 hover:text-rose-300"
                        }`}
                      >
                        <ShieldAlert className="w-3 h-3" />
                        <span>Block</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* Shannon Entropy Threshold Slider & Live Highlight Preview */}
          <GlassCard className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white font-display">
                    Shannon Entropy Threshold &amp; Live Analyzer
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Detect high-entropy passwords, credentials, and API tokens based on character randomness
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">Active Threshold:</span>
                <span className="text-base font-bold font-mono text-amber-400 px-2.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">
                  {draft.entropy_threshold.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Slider control */}
            <div className="space-y-2 p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
              <div className="flex justify-between text-xs font-mono text-neutral-400">
                <span>2.5 (Strict - Lower false negatives)</span>
                <span className="text-cyan-400">4.0 (Recommended Default)</span>
                <span>5.5 (Relaxed - Raw keys only)</span>
              </div>
              <input
                type="range"
                min="2.5"
                max="5.5"
                step="0.1"
                value={draft.entropy_threshold}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    entropy_threshold: parseFloat(e.target.value),
                  })
                }
                className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                <span>Max entropy detected in sample: <strong className="text-white font-mono">{tokenAnalysis.maxEntropy}</strong></span>
                <span>
                  {draft.entropy_threshold < 3.2 ? (
                    <span className="text-amber-400">Aggressive Sensitivity</span>
                  ) : draft.entropy_threshold <= 4.2 ? (
                    <span className="text-emerald-400">Optimal Enterprise Balance</span>
                  ) : (
                    <span className="text-neutral-400">Permissive (Critical leaks only)</span>
                  )}
                </span>
              </div>
            </div>

            {/* Live Highlighted Preview Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  Live Token Highlight Preview (Real-time Entropy Filter)
                </span>
                <button
                  onClick={() => setPreviewText(DEFAULT_SAMPLE_TEXT)}
                  className="text-[11px] text-neutral-400 hover:text-cyan-400 underline"
                >
                  Reset Sample
                </button>
              </div>

              {/* Render highlighted preview text */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {tokenAnalysis.analyzed.map((item) => {
                  if (item.isFlagged) {
                    return (
                      <span
                        key={item.key}
                        title={`Shannon Entropy: ${item.entropy} (Exceeds threshold ${draft.entropy_threshold.toFixed(1)})`}
                        className="px-1 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold transition-all"
                      >
                        {item.token}
                        <span className="text-[9px] ml-1 px-1 rounded bg-rose-900/60 text-rose-200">
                          {item.entropy}
                        </span>
                      </span>
                    );
                  }
                  return <span key={item.key} className="text-neutral-300">{item.token}</span>;
                })}
              </div>

              {/* Quick editable test textarea */}
              <textarea
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder="Type or paste text here to test custom token entropy in real time..."
                rows={2}
                className="w-full p-2.5 rounded-lg bg-neutral-900/50 border border-neutral-800 text-xs font-mono text-neutral-400 focus:text-neutral-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
          </GlassCard>
        </div>

        {/* Right Column (1 Col): Canary Honeytokens, Alert Severity & AI Triage */}
        <div className="space-y-6">
          {/* Canary Honeytoken Traps */}
          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white font-display">
                  Canary Honeytokens
                </h3>
                <p className="text-xs text-neutral-400">
                  Any appearance in LLM traffic triggers instant P0 Critical alerts
                </p>
              </div>
            </div>

            {/* Input & Generator */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. CANARY-SS-7F3A9"
                  value={newCanaryToken}
                  onChange={(e) => setNewCanaryToken(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700/60 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500/50"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddCanary}
                  disabled={!newCanaryToken.trim()}
                  className="px-2.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerateCanary}
                className="w-full text-xs text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 justify-center h-7"
              >
                <Sparkles className="w-3 h-3 mr-1.5 text-rose-400" />
                Generate Random Honeytoken
              </Button>
            </div>

            {/* Canary List */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              <AnimatePresence>
                {draft.canary_tokens.length === 0 ? (
                  <div className="p-4 rounded-lg bg-neutral-900/40 border border-neutral-800 text-center text-xs text-neutral-400">
                    No active honeytokens. Add or generate one above to trap unauthorized exfiltrations.
                  </div>
                ) : (
                  draft.canary_tokens.map((token) => (
                    <motion.div
                      key={token}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-2.5 rounded-lg bg-neutral-900/80 border border-rose-500/20 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <KeyRound className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="text-xs font-mono text-rose-200 truncate font-semibold">
                          {token}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopy(token)}
                          className="p-1 rounded text-neutral-400 hover:text-white transition-colors"
                          title="Copy token"
                        >
                          {copiedToken === token ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteCanary(token)}
                          className="p-1 rounded text-neutral-400 hover:text-rose-400 transition-colors"
                          title="Delete canary"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </GlassCard>

          {/* Minimum Severity Selector */}
          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white font-display">
                  Alert Minimum Severity
                </h3>
                <p className="text-xs text-neutral-400">
                  Floor threshold for creating incidents in the Alerts Center
                </p>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5 p-1 rounded-xl bg-neutral-900/80 border border-neutral-800">
              {(["info", "low", "medium", "high", "critical"] as Severity[]).map((sev) => {
                const isActive = draft.alert_min_severity === sev;
                return (
                  <button
                    key={sev}
                    onClick={() => setDraft({ ...draft, alert_min_severity: sev })}
                    className={`py-1.5 rounded-lg text-xs font-mono  transition-all ${
                      isActive
                        ? sev === "critical"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/50 font-bold"
                          : sev === "high"
                          ? "bg-orange-500/20 text-orange-300 border border-orange-500/50 font-bold"
                          : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    {sev}
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* LLM Triage Engine Selector */}
          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white font-display">
                    Automated AI Triage
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Engine for auto-analyzing forensic findings
                  </p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={draft.llm_triage.enabled}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    llm_triage: { ...draft.llm_triage, enabled: e.target.checked },
                  })
                }
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 accent-violet-500 cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-neutral-400">Triage Engine Provider</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: "auto", name: "Auto (Recommended)", desc: "Dynamically picks best local/cloud backend" },
                  { id: "groq", name: "Groq Cloud Llama-3", desc: "Ultra-low latency sub-second inference" },
                  { id: "ollama", name: "Ollama (Local Engine)", desc: "100% on-device private airgapped triage" },
                  { id: "featherless", name: "Featherless AI", desc: "Serverless open-source model execution" },
                  { id: "rules", name: "Rules-Only (No LLM)", desc: "Deterministic heuristic regex matching" },
                ].map((item) => {
                  const isSelected = draft.llm_triage.engine === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          llm_triage: {
                            ...draft.llm_triage,
                            engine: item.id as Policy["llm_triage"]["engine"],
                          },
                        })
                      }
                      className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-violet-950/20 border-violet-500/40 text-white"
                          : "bg-neutral-900/40 border-neutral-800 text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>{item.name}</span>
                        {isSelected && <Badge variant="violet" size="xs">ACTIVE</Badge>}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">{item.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </GlassCard>

          {/* Immutable Hard Guardrails */}
          <GlassCard className="p-5 space-y-3 bg-neutral-950/40 border border-neutral-800">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-semibold text-white">
                Immutable Core Guardrails
              </h4>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded bg-neutral-900/60 border border-neutral-800">
                <span className="text-neutral-300">Client-Side Storage Redaction</span>
                <span className="font-mono text-emerald-400 text-[11px]">ENFORCED (TRUE)</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-neutral-900/60 border border-neutral-800">
                <span className="text-neutral-300">ShadowScope Self-Exclusion</span>
                <span className="font-mono text-emerald-400 text-[11px]">ENFORCED (TRUE)</span>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
