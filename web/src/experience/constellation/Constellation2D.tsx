import { useState, useMemo } from "react";
import type { GraphNode, GraphLink } from "./NodeDetailPanel";

interface Constellation2DProps {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode) => void;
  reducedMotion?: boolean;
}

export function Constellation2D({
  nodes,
  links,
  selectedNode,
  onSelectNode,
  reducedMotion = false,
}: Constellation2DProps) {
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // Layout calculation: Radial layered layout around center
  const layout = useMemo(() => {
    const width = 900;
    const height = 650;
    const centerX = width / 2;
    const centerY = height / 2;

    const providers = nodes.filter((n) => n.kind === "provider");
    const hosts = nodes.filter((n) => n.kind === "host");
    const agents = nodes.filter((n) => n.kind === "agent");
    const processes = nodes.filter((n) => n.kind === "process");

    const positions = new Map<string, { x: number; y: number }>();

    // 1. Providers in center circle (r = 110)
    const rProvider = 110;
    providers.forEach((p, idx) => {
      const angle = (idx / Math.max(1, providers.length)) * 2 * Math.PI - Math.PI / 2;
      positions.set(p.id, {
        x: centerX + Math.cos(angle) * rProvider,
        y: centerY + Math.sin(angle) * rProvider,
      });
    });

    // 2. Hosts in middle circle (r = 195)
    const rHost = 195;
    hosts.forEach((h, idx) => {
      const angle = (idx / Math.max(1, hosts.length)) * 2 * Math.PI - Math.PI / 3;
      positions.set(h.id, {
        x: centerX + Math.cos(angle) * rHost,
        y: centerY + Math.sin(angle) * rHost,
      });
    });

    // 3. Agents in ring (r = 265)
    const rAgent = 265;
    agents.forEach((a, idx) => {
      const angle = (idx / Math.max(1, agents.length)) * 2 * Math.PI;
      positions.set(a.id, {
        x: centerX + Math.cos(angle) * rAgent,
        y: centerY + Math.sin(angle) * rAgent,
      });
    });

    // 4. Processes in outer perimeter (r = 310)
    const rProc = 310;
    processes.forEach((pr, idx) => {
      const angle = (idx / Math.max(1, processes.length)) * 2 * Math.PI + Math.PI / 6;
      positions.set(pr.id, {
        x: centerX + Math.cos(angle) * rProc,
        y: centerY + Math.sin(angle) * rProc,
      });
    });

    return { width, height, centerX, centerY, positions };
  }, [nodes]);

  const getNodeColor = (risk: number) => {
    if (risk >= 80) return "#df6a68"; // Critical (red)
    if (risk >= 50) return "#d4915a"; // High (orange)
    if (risk >= 20) return "#c9b467"; // Med (yellow)
    return "#bad6f7"; // Low (cyan)
  };

  return (
    <div className="relative w-full h-full min-h-[500px] flex items-center justify-center bg-bg-2/50 overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="w-full h-full max-h-[750px] object-contain"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Radial radar rings */}
          <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#bad6f7" stopOpacity="0.08" />
            <stop offset="60%" stopColor="#9dadc2" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#0b0d13" stopOpacity="0" />
          </radialGradient>

          {/* Glow filter */}
          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="activeGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Grid Background */}
        <circle cx={layout.centerX} cy={layout.centerY} r="320" fill="url(#radarGlow)" />
        <circle cx={layout.centerX} cy={layout.centerY} r="110" fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
        <circle cx={layout.centerX} cy={layout.centerY} r="195" fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
        <circle cx={layout.centerX} cy={layout.centerY} r="265" fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
        <circle cx={layout.centerX} cy={layout.centerY} r="310" fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />

        {/* Crosshair guide lines */}
        <line
          x1={layout.centerX - 330}
          y1={layout.centerY}
          x2={layout.centerX + 330}
          y2={layout.centerY}
          stroke="rgba(255,255,255,0.04)"
        />
        <line
          x1={layout.centerX}
          y1={layout.centerY - 330}
          x2={layout.centerX}
          y2={layout.centerY + 330}
          stroke="rgba(255,255,255,0.04)"
        />

        {/* Links */}
        <g className="links">
          {links.map((link, idx) => {
            const sId = typeof link.source === "object" ? link.source.id : link.source;
            const tId = typeof link.target === "object" ? link.target.id : link.target;
            const p1 = layout.positions.get(sId);
            const p2 = layout.positions.get(tId);
            if (!p1 || !p2) return null;

            const isHighlighted =
              selectedNode?.id === sId ||
              selectedNode?.id === tId ||
              hoveredNode?.id === sId ||
              hoveredNode?.id === tId;

            const color = getNodeColor(link.risk);
            const strokeOpacity = isHighlighted ? 0.9 : 0.25;
            const strokeWidth = isHighlighted ? 2.5 : Math.max(1, Math.min(2.5, link.weight * 0.4));

            return (
              <line
                key={idx}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeOpacity={strokeOpacity}
                strokeDasharray={isHighlighted && !reducedMotion ? "5 3" : undefined}
                className={isHighlighted && !reducedMotion ? "animate-[pulse_1.5s_infinite]" : undefined}
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g className="nodes">
          {nodes.map((node) => {
            const pos = layout.positions.get(node.id);
            if (!pos) return null;

            const isSelected = selectedNode?.id === node.id;
            const isHovered = hoveredNode?.id === node.id;
            const color = getNodeColor(node.risk);
            const baseRadius = node.kind === "provider" ? 12 : node.kind === "agent" ? 10 : 8;
            const radius = isSelected ? baseRadius + 4 : isHovered ? baseRadius + 2 : baseRadius;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => onSelectNode(node)}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-transform duration-200"
              >
                {/* Outer halo if selected or high risk */}
                {(isSelected || node.risk >= 80) && (
                  <circle
                    r={radius + 8}
                    fill="none"
                    stroke={color}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeOpacity={isSelected ? 0.8 : 0.4}
                    strokeDasharray={isSelected && !reducedMotion ? "4 3" : undefined}
                    className={isSelected && !reducedMotion ? "animate-spin origin-center" : undefined}
                  />
                )}

                {/* Node Shape */}
                {node.kind === "agent" ? (
                  // Diamond for agents
                  <polygon
                    points={`0,-${radius * 1.3} ${radius * 1.3},0 0,${radius * 1.3} -${radius * 1.3},0`}
                    fill={color}
                    fillOpacity={0.85}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? 2 : 1}
                    filter="url(#nodeGlow)"
                  />
                ) : node.kind === "process" ? (
                  // Rounded square for processes
                  <rect
                    x={-radius}
                    y={-radius}
                    width={radius * 2}
                    height={radius * 2}
                    rx="1"
                    fill={color}
                    fillOpacity={0.8}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? 2 : 1}
                    filter="url(#nodeGlow)"
                  />
                ) : (
                  // Circle for providers and hosts
                  <circle
                    r={radius}
                    fill={color}
                    fillOpacity={0.9}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? 2 : 1}
                    filter={isSelected ? "url(#activeGlow)" : "url(#nodeGlow)"}
                  />
                )}

                {/* Core pulse for critical threat */}
                {node.risk >= 80 && !reducedMotion && (
                  <circle r={radius * 0.4} fill="#ffffff" className="animate-ping" opacity="0.75" />
                )}

                {/* Node Label */}
                <text
                  y={radius + 12}
                  textAnchor="middle"
                  className={`text-[9px] font-mono pointer-events-none select-none ${
                    isSelected ? "fill-text font-bold" : isHovered ? "fill-primary" : "fill-muted"
                  }`}
                 
                >
                  {node.label.length > 14 ? `${node.label.slice(0, 12)}…` : node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Hover Card */}
      {hoveredNode && !selectedNode && (
        <div
          className="absolute bottom-4 left-4 z-10 rounded-lg border border-border bg-bg-2/90 px-3 py-2 pointer-events-none"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: getNodeColor(hoveredNode.risk) }}
            />
            <span className="font-mono text-xs font-semibold text-text">{hoveredNode.label}</span>
            <span className="font-mono text-[10px] text-muted">[{hoveredNode.kind}]</span>
          </div>
          <div className="text-[10px] font-mono text-muted mt-1">
            Risk: <span className="text-text font-semibold">{hoveredNode.risk}</span>/100 · Size: {hoveredNode.size}
          </div>
        </div>
      )}
    </div>
  );
}

