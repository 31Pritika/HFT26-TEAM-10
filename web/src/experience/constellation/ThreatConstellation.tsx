import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import {
  Search,
  RotateCw,
  Eye,
  SlidersHorizontal,
  RefreshCw,
  Cpu,
  Cloud,
  Bot,
  Globe,
  Radio,
} from "lucide-react";
import { api } from "../../shared/api";
import { useDocumentTitle } from "../../shared/useDocumentTitle";
import type { GraphData } from "../../shared/types";
import { NodeDetailPanel, type GraphNode, type GraphLink } from "./NodeDetailPanel";
import { Constellation2D } from "./Constellation2D";

const Constellation3D = lazy(() =>
  import("./Constellation3D").then((m) => ({ default: m.Constellation3D }))
);

export default function ThreatConstellation() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [minRisk, setMinRisk] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [forced2D, setForced2D] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  useDocumentTitle("Threat Graph · ShadowScope");

  // Environment checks
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const hasWebGL = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const canvas = document.createElement("canvas");
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
      );
    } catch {
      return false;
    }
  }, []);

  const use2D = forced2D || isMobile || !hasWebGL || prefersReducedMotion;

  // Data fetching with 10s auto-refresh
  const fetchGraph = async () => {
    try {
      const result = await api.getGraph("24h");
      setData(result);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Failed to load graph data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraph();
    const interval = setInterval(fetchGraph, 10000);
    return () => clearInterval(interval);
  }, []);

  // Filtered nodes and links
  const { filteredNodes, filteredLinks } = useMemo(() => {
    if (!data) return { filteredNodes: [], filteredLinks: [] };

    const nodes = data.nodes.filter((node) => {
      const matchesKind = kindFilter === "all" || node.kind === kindFilter;
      const matchesRisk = node.risk >= minRisk;
      const matchesSearch =
        searchQuery === "" ||
        node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesKind && matchesRisk && matchesSearch;
    });

    const activeNodeIds = new Set(nodes.map((n) => n.id));
    const links = data.links.filter((link) => {
      const sId = typeof (link.source as unknown) === "object" && link.source !== null ? (link.source as unknown as { id: string }).id : String(link.source);
      const tId = typeof (link.target as unknown) === "object" && link.target !== null ? (link.target as unknown as { id: string }).id : String(link.target);
      return activeNodeIds.has(sId) && activeNodeIds.has(tId);
    });

    return { filteredNodes: nodes, filteredLinks: links };
  }, [data, kindFilter, minRisk, searchQuery]);

  // Search match suggestions
  const searchMatches = useMemo(() => {
    if (!data || searchQuery.trim().length < 1) return [];
    return data.nodes
      .filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 5);
  }, [data, searchQuery]);

  const maxRisk = useMemo(() => {
    if (!data?.nodes.length) return 0;
    return Math.max(...data.nodes.map((n) => n.risk));
  }, [data]);

  return (
    <div className="relative flex flex-col h-[calc(100vh-5rem)] min-h-[680px] w-full rounded-xl border border-border bg-bg-2 overflow-hidden shadow-2xl">
      {/* Top Control Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur-md">
        {/* Title & Live Status */}
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-semibold text-text text-base md:text-lg">
                Threat Constellation
              </h1>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-[11px] font-mono text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                </span>
                Live 24h
              </span>
            </div>
            <p className="text-[11px] font-mono text-muted hidden sm:block">
              Auto-refreshing every 10s · Last updated {lastRefreshed.toLocaleTimeString()}
            </p>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Node Search */}
          <div className="relative w-44 sm:w-60">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
            <input
              type="text"
              placeholder="Search node or host…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-solid pl-8 pr-3 py-1.5 text-xs font-mono text-text placeholder:text-muted focus:border-primary focus:outline-none"
            />
            {/* Search Dropdown */}
            {searchMatches.length > 0 && searchQuery && (
              <div className="absolute left-0 top-full mt-1.5 w-full z-30 rounded-lg border border-border bg-bg-2/95 p-1 backdrop-blur-xl shadow-xl">
                {searchMatches.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => {
                      setSelectedNode(node);
                      setSearchQuery("");
                    }}
                    className="w-full flex items-center justify-between p-2 rounded text-left hover:bg-surface text-xs font-mono transition-colors"
                  >
                    <span className="text-text truncate">{node.label}</span>
                    <span className="text-[10px] text-muted uppercase">[{node.kind}]</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3D / 2D View Switch */}
          <button
            onClick={() => setForced2D(!forced2D)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-solid text-xs font-mono text-muted hover:text-text transition-colors"
            title="Toggle between 3D WebGL and 2D SVG canvas"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{use2D ? "Switch to 3D" : "Switch to 2D"}</span>
          </button>

          {/* Auto-Rotate Toggle (3D only) */}
          {!use2D && (
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                autoRotate
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted hover:text-text"
              }`}
              title="Toggle orbital rotation"
            >
              <RotateCw className={`h-3.5 w-3.5 ${autoRotate ? "animate-spin" : ""}`} style={{ animationDuration: "8s" }} />
              <span className="hidden sm:inline">Orbit</span>
            </button>
          )}

          {/* Manual Refresh */}
          <button
            onClick={fetchGraph}
            className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-solid text-muted hover:text-text transition-colors"
            title="Refresh graph data"
            aria-label="Refresh data"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Chips & Stats Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-bg-2/70 px-4 py-2 text-xs font-mono">
        {/* Kind Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {[
            { id: "all", label: "All Nodes", icon: Radio },
            { id: "process", label: "Processes", icon: Cpu },
            { id: "provider", label: "AI Providers", icon: Cloud },
            { id: "agent", label: "Agents", icon: Bot },
            { id: "host", label: "Hosts", icon: Globe },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setKindFilter(id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono transition-all whitespace-nowrap ${
                kindFilter === id
                  ? "bg-surface-solid text-primary border border-primary/30"
                  : "text-muted hover:text-text hover:bg-surface"
              }`}
            >
              <Icon className="h-3 w-3" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Severity Threshold Slider & Summary Stats */}
        <div className="flex items-center gap-4 text-[11px] text-muted">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3 w-3 text-muted" />
            <span>Risk &gt; {minRisk}</span>
            <input
              type="range"
              min="0"
              max="80"
              step="10"
              value={minRisk}
              onChange={(e) => setMinRisk(Number(e.target.value))}
              className="w-16 sm:w-20 accent-primary cursor-pointer"
            />
          </div>

          <div className="hidden md:flex items-center gap-3 border-l border-border pl-3">
            <span>
              Nodes: <strong className="text-text">{filteredNodes.length}</strong>
            </span>
            <span>
              Links: <strong className="text-text">{filteredLinks.length}</strong>
            </span>
            <span>
              Max Risk: <strong className="text-danger">{maxRisk}/100</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Main Graph Canvas Area */}
      <div className="relative flex-1 w-full overflow-hidden">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center bg-bg">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="font-mono text-xs text-muted">Loading Threat Constellation topology…</p>
            </div>
          </div>
        ) : use2D ? (
          <Constellation2D
            nodes={filteredNodes}
            links={filteredLinks}
            selectedNode={selectedNode}
            onSelectNode={(node) => setSelectedNode(node)}
            reducedMotion={prefersReducedMotion}
          />
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-bg">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              </div>
            }
          >
            <Constellation3D
              nodes={filteredNodes}
              links={filteredLinks}
              selectedNode={selectedNode}
              onSelectNode={(node) => setSelectedNode(node)}
              autoRotate={autoRotate}
              reducedMotion={prefersReducedMotion}
            />
          </Suspense>
        )}

        {/* Slide-over Node Detail Panel */}
        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            links={data ? (data.links as GraphLink[]) : []}
            allNodes={data ? (data.nodes as GraphNode[]) : []}
            onClose={() => setSelectedNode(null)}
            onSelectNode={(newNode) => setSelectedNode(newNode)}
          />
        )}

        {/* Legend Bar (Bottom Left) */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border/80 bg-bg/90 px-3 py-2 text-[10px] font-mono text-muted backdrop-blur-md shadow-lg pointer-events-none sm:pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span>Low (&lt;20)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning" />
            <span>Med (20-50)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>High (50-80)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-danger" />
            <span>Critical (&gt;80)</span>
          </div>
          <div className="hidden lg:flex items-center gap-1.5 border-l border-border pl-2">
            <span className="inline-block h-1 w-3 bg-primary rounded animate-pulse" />
            <span>Particles = Egress Volume</span>
          </div>
        </div>
      </div>
    </div>
  );
}
