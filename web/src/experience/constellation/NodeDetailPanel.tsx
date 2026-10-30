import { Link } from "react-router-dom";
import { X, ShieldAlert, Cpu, Cloud, Bot, Globe, ArrowUpRight, Activity } from "lucide-react";

export interface GraphNode {
  id: string;
  label: string;
  kind: "process" | "provider" | "host" | "agent";
  risk: number;
  size: number;
  x?: number;
  y?: number;
  z?: number;
}

export interface GraphLink {
  source: string | { id: string };
  target: string | { id: string };
  weight: number;
  risk: number;
}

interface NodeDetailPanelProps {
  node: GraphNode;
  links: GraphLink[];
  allNodes: GraphNode[];
  onClose: () => void;
  onSelectNode: (node: GraphNode) => void;
}

export function NodeDetailPanel({
  node,
  links,
  allNodes,
  onClose,
  onSelectNode,
}: NodeDetailPanelProps) {
  // Find connected links
  const nodeId = node.id;
  const connectedLinks = links.filter((l) => {
    const sId = typeof l.source === "object" ? l.source.id : l.source;
    const tId = typeof l.target === "object" ? l.target.id : l.target;
    return sId === nodeId || tId === nodeId;
  });

  const outgoing = connectedLinks.filter((l) => {
    const sId = typeof l.source === "object" ? l.source.id : l.source;
    return sId === nodeId;
  });

  const incoming = connectedLinks.filter((l) => {
    const tId = typeof l.target === "object" ? l.target.id : l.target;
    return tId === nodeId;
  });

  const getRiskColor = (risk: number) => {
    if (risk >= 80) return { text: "text-danger", border: "border-danger/40", bg: "bg-danger/10", fill: "#FF3B5C", label: "Critical" };
    if (risk >= 50) return { text: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10", fill: "#FF8A3D", label: "High" };
    if (risk >= 20) return { text: "text-warning", border: "border-warning/40", bg: "bg-warning/10", fill: "#FACC15", label: "Medium" };
    return { text: "text-primary", border: "border-primary/40", bg: "bg-primary/10", fill: "#22D3EE", label: "Low" };
  };

  const riskInfo = getRiskColor(node.risk);

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case "provider":
        return <Cloud className="h-4 w-4 text-primary" />;
      case "agent":
        return <Bot className="h-4 w-4 text-amber-400" />;
      case "host":
        return <Globe className="h-4 w-4 text-accent" />;
      default:
        return <Cpu className="h-4 w-4 text-muted" />;
    }
  };

  return (
    <div
      className="absolute top-4 right-4 z-20 w-80 sm:w-96 max-h-[calc(100%-2rem)] flex flex-col rounded-xl border border-border bg-bg-2/95 p-5 backdrop-blur-xl shadow-2xl overflow-y-auto"
      role="dialog"
      aria-label={`Details for ${node.label}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-solid">
            {getKindIcon(node.kind)}
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-text truncate text-base" title={node.label}>
              {node.label}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-xs uppercase px-1.5 py-0.5 rounded border border-border bg-surface text-muted">
                {node.kind}
              </span>
              <span className="font-mono text-xs text-muted truncate">{node.id}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted hover:text-text hover:bg-surface border border-transparent hover:border-border transition-colors"
          aria-label="Close detail panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Risk Gauge & Metrics */}
      <div className="py-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted font-mono">Threat Score</span>
          <span
            className={`font-mono text-xs font-semibold px-2 py-0.5 rounded-full border ${riskInfo.border} ${riskInfo.bg} ${riskInfo.text}`}
          >
            {riskInfo.label} · {node.risk}/100
          </span>
        </div>

        {/* Meter bar */}
        <div className="h-2 w-full rounded-full bg-surface-solid overflow-hidden border border-border/50">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(5, node.risk)}%`, backgroundColor: riskInfo.fill }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg border border-border/60 bg-surface/50 p-2.5">
            <div className="text-[10px] font-mono uppercase text-muted">Traffic Weight</div>
            <div className="text-sm font-semibold font-mono text-text mt-0.5">{node.size} units</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-surface/50 p-2.5">
            <div className="text-[10px] font-mono uppercase text-muted">Connections</div>
            <div className="text-sm font-semibold font-mono text-text mt-0.5">{connectedLinks.length} active</div>
          </div>
        </div>
      </div>

      {/* Threat Context */}
      <div className="py-3 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-mono text-muted mb-2">
          <ShieldAlert className="h-3.5 w-3.5 text-danger" />
          <span>Security Assessment</span>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          {node.risk >= 80 ? (
            <span className="text-danger/90 font-medium">
              High telemetry risk: Multiple unencrypted credentials, sensitive prompt exfiltration or dangerous agent operations detected along this vertex.
            </span>
          ) : node.risk >= 50 ? (
            <span className="text-amber-400/90 font-medium">
              Elevated exposure: Regular unstructured AI queries with prospective PII or unapproved shadow cloud routing.
            </span>
          ) : (
            <span className="text-muted">
              Standard telemetry signature: Conforms to internal baseline. No canary alerts or critical egress patterns identified.
            </span>
          )}
        </p>
      </div>

      {/* Connected Entities */}
      <div className="py-3 border-b border-border space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-muted">
          <span>Adjacent Nodes ({connectedLinks.length})</span>
          <Activity className="h-3.5 w-3.5" />
        </div>

        {outgoing.length > 0 && (
          <div>
            <div className="text-[10px] font-mono uppercase text-primary mb-1.5 flex items-center gap-1">
              <span>Outgoing Egress →</span>
            </div>
            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {outgoing.map((l, i) => {
                const targetId = typeof l.target === "object" ? l.target.id : l.target;
                const targetNode = allNodes.find((n) => n.id === targetId);
                const targetLabel = targetNode ? targetNode.label : targetId;
                return (
                  <button
                    key={i}
                    onClick={() => targetNode && onSelectNode(targetNode)}
                    className="w-full flex items-center justify-between gap-2 p-1.5 rounded border border-border/50 bg-surface/30 hover:bg-surface hover:border-primary/40 text-left transition-colors group"
                  >
                    <span className="text-xs text-text group-hover:text-primary truncate font-mono">
                      {targetLabel}
                    </span>
                    <span className="text-[10px] font-mono text-muted shrink-0">
                      {l.weight} req · {l.risk}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {incoming.length > 0 && (
          <div>
            <div className="text-[10px] font-mono uppercase text-accent mb-1.5 flex items-center gap-1">
              <span>← Incoming Sources</span>
            </div>
            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {incoming.map((l, i) => {
                const sourceId = typeof l.source === "object" ? l.source.id : l.source;
                const sourceNode = allNodes.find((n) => n.id === sourceId);
                const sourceLabel = sourceNode ? sourceNode.label : sourceId;
                return (
                  <button
                    key={i}
                    onClick={() => sourceNode && onSelectNode(sourceNode)}
                    className="w-full flex items-center justify-between gap-2 p-1.5 rounded border border-border/50 bg-surface/30 hover:bg-surface hover:border-primary/40 text-left transition-colors group"
                  >
                    <span className="text-xs text-text group-hover:text-primary truncate font-mono">
                      {sourceLabel}
                    </span>
                    <span className="text-[10px] font-mono text-muted shrink-0">
                      {l.weight} req · {l.risk}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Deep Link Actions */}
      <div className="pt-3 flex flex-col gap-2">
        <Link
          to={`/app/alerts?process=${encodeURIComponent(node.label)}`}
          className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-surface hover:border-primary/50 text-xs font-mono text-text hover:text-primary transition-colors"
        >
          <span>View Related Alerts</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        {node.kind === "agent" ? (
          <Link
            to="/app/agents"
            className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-surface hover:border-accent/50 text-xs font-mono text-text hover:text-accent transition-colors"
          >
            <span>Open Agent Sandbox Console</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <Link
            to="/app/inventory"
            className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-surface hover:border-accent/50 text-xs font-mono text-text hover:text-accent transition-colors"
          >
            <span>Inspect in AI Inventory</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
