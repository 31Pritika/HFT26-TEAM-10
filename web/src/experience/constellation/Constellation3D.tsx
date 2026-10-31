import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import type { GraphNode, GraphLink } from "./NodeDetailPanel";
import { useThemeColors } from "../../shared/theme";

interface Constellation3DProps {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode) => void;
  autoRotate?: boolean;
  reducedMotion?: boolean;
}

type SimNode = GraphNode & { fx?: number; fy?: number; fz?: number };
type SimLink = GraphLink;

// How long the first layout may run. It settles and pins before the first 10s refresh.
const LAYOUT_MS = 8000;
const MAX_VISIBLE_WEIGHT = 8;

const endpointId = (end: GraphLink["source"]) => (typeof end === "object" ? end.id : end);
const linkId = (link: GraphLink) => `${endpointId(link.source)}->${endpointId(link.target)}`;
const riskBand = (risk: number) => (risk >= 80 ? 3 : risk >= 60 ? 2 : risk >= 50 ? 1.5 : risk >= 20 ? 1 : 0);

function withAlpha(hex: string, alpha: number) {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function nodeTooltip(node: any) {
  return `<div style="background: var(--elevated); border: 1px solid var(--border); padding: 6px 10px; border-radius: 6px; font-family: var(--font-sans); font-size: 11px; color: var(--text);">
    <div style="font-family: var(--font-mono); font-weight: 500; color: var(--primary);">${node.label}</div>
    <div style="color: var(--muted);">${node.kind} · Risk ${node.risk}/100</div>
  </div>`;
}

const linkParticleSpeed = (link: any) => 0.005 + (link.risk || 0) * 0.00012;
const linkParticleWidth = () => 2.4;
const linkWidth = (link: any) => Math.max(0.8, Math.min(2.8, (link.weight || 1) * 0.35));

/**
 * The layout writes each node's position onto its object, so these objects outlive every refresh.
 * `merge` returns a new graph only when ids change, because any new graphData restarts the layout.
 */
function createGraphStore() {
  const nodeCache = new Map<string, SimNode>();
  const linkCache = new Map<string, SimLink>();
  let current = { key: "", nodes: [] as SimNode[], links: [] as SimLink[] };

  return {
    merge(nodes: GraphNode[], links: GraphLink[]) {
      const nextNodes = nodes.map((node) => {
        const cached = nodeCache.get(node.id);
        if (cached) return Object.assign(cached, node);
        const fresh: SimNode = { ...node };
        nodeCache.set(node.id, fresh);
        return fresh;
      });

      const nextLinks = links.map((link) => {
        const id = linkId(link);
        const cached = linkCache.get(id);
        if (cached) return Object.assign(cached, { weight: link.weight, risk: link.risk });
        const fresh: SimLink = { ...link };
        linkCache.set(id, fresh);
        return fresh;
      });

      // A node that joins later starts beside a neighbour, rather than flying in from the centre.
      nextLinks.forEach((link) => {
        const source = nodeCache.get(endpointId(link.source));
        const target = nodeCache.get(endpointId(link.target));
        if (!source || !target) return;
        const [placed, unplaced] = source.x === undefined ? [target, source] : [source, target];
        if (placed.x === undefined || unplaced.x !== undefined) return;
        unplaced.x = placed.x + 12;
        unplaced.y = (placed.y ?? 0) + 12;
        unplaced.z = (placed.z ?? 0) + 12;
      });

      const key = [...nextNodes.map((node) => node.id), ...nextLinks.map(linkId)].join("|");
      if (key !== current.key) current = { key, nodes: nextNodes, links: nextLinks };
      return current;
    },

    /** With every node pinned, a restart can only move the ones that have just arrived. */
    pin() {
      nodeCache.forEach((node) => {
        if (node.x === undefined) return;
        node.fx = node.x;
        node.fy = node.y;
        node.fz = node.z;
      });
    },
  };
}

export const Constellation3D = memo(function Constellation3D({
  nodes,
  links,
  selectedNode,
  onSelectNode,
  autoRotate = true,
  reducedMotion = false,
}: Constellation3DProps) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const colors = useThemeColors();

  const [graph] = useState(createGraphStore);
  const visualKey = useRef("");

  // Update canvas size on container resize
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || 800,
          height: containerRef.current.clientHeight || 600,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Configure auto-rotation
  useEffect(() => {
    if (fgRef.current && !reducedMotion) {
      const controls = fgRef.current.controls();
      if (controls) {
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = 0.5;
      }
    }
  }, [autoRotate, reducedMotion]);

  // Fly to selected node
  useEffect(() => {
    if (
      fgRef.current &&
      selectedNode &&
      selectedNode.x !== undefined &&
      selectedNode.y !== undefined &&
      selectedNode.z !== undefined
    ) {
      const distance = 70;
      const distRatio = 1 + distance / Math.hypot(selectedNode.x || 1, selectedNode.y || 1, selectedNode.z || 1);
      fgRef.current.cameraPosition(
        {
          x: (selectedNode.x || 0) * distRatio,
          y: (selectedNode.y || 0) * distRatio,
          z: (selectedNode.z || 0) * distRatio,
        },
        selectedNode,
        1200
      );
    }
  }, [selectedNode]);

  const graphData = useMemo(() => graph.merge(nodes, links), [graph, nodes, links]);

  // Counters tick constantly on a live machine. Only redraw when that would look different.
  useEffect(() => {
    const next = [
      ...nodes.map((node) => `${node.id}:${riskBand(node.risk)}`),
      ...links.map((link) => `${linkId(link)}:${riskBand(link.risk)}:${Math.min(link.weight, MAX_VISIBLE_WEIGHT)}`),
    ].join("|");
    if (visualKey.current && visualKey.current !== next) fgRef.current?.refresh();
    visualKey.current = next;
  }, [nodes, links]);

  const pinNodes = useCallback(() => {
    graph.pin();
  }, [graph]);

  const nodeColor = useCallback(
    (risk: number) => {
      if (risk >= 80) return colors.critical;
      if (risk >= 50) return colors.high;
      if (risk >= 20) return colors.medium;
      return colors.primary;
    },
    [colors],
  );

  const nodeObject = useCallback(
    (node: any) => {
      const group = new THREE.Group();
      const color = new THREE.Color(nodeColor(node.risk));

      // Geometry by entity category
      let geometry: THREE.BufferGeometry;
      if (node.kind === "agent") {
        geometry = new THREE.OctahedronGeometry(6);
      } else if (node.kind === "provider") {
        geometry = new THREE.SphereGeometry(9, 16, 16);
      } else if (node.kind === "host") {
        geometry = new THREE.IcosahedronGeometry(6);
      } else {
        geometry = new THREE.BoxGeometry(6, 6, 6);
      }

      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: node.risk >= 80 ? 0.9 : 0.45,
        roughness: 0.3,
        metalness: 0.7,
      });

      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);

      // Outer halo for providers and high risks
      if (node.kind === "provider" || node.risk >= 60) {
        const haloGeo = new THREE.RingGeometry(8, 9.5, 32);
        const haloMat = new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.35,
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        group.add(halo);
      }

      // Floating monospace label sprite
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, 256, 64);
        ctx.font = "500 22px 'JetBrains Mono', monospace";
        ctx.fillStyle = node.risk >= 80 ? colors.critical : colors.text;
        ctx.textAlign = "center";
        const text = node.label.length > 15 ? `${node.label.slice(0, 13)}…` : node.label;
        ctx.fillText(text, 128, 40);
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0.85,
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(0, -11, 0);
        sprite.scale.set(22, 5.5, 1);
        group.add(sprite);
      }

      return group;
    },
    [colors, nodeColor],
  );

  const handleNodeClick = useCallback((node: any) => onSelectNode(node as GraphNode), [onSelectNode]);
  const linkParticles = useCallback(
    (link: any) => (reducedMotion ? 0 : Math.max(1, Math.min(5, Math.ceil((link.weight || 1) * 1.2)))),
    [reducedMotion],
  );
  const linkParticleColor = useCallback((link: any) => nodeColor(link.risk), [nodeColor]);
  const linkColor = useCallback((link: any) => withAlpha(nodeColor(link.risk), 0.28), [nodeColor]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[550px] bg-bg overflow-hidden">
      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        backgroundColor={colors.bg}
        showNavInfo={false}
        enableNodeDrag={true}
        cooldownTime={LAYOUT_MS}
        onEngineStop={pinNodes}
        nodeLabel={nodeTooltip}
        nodeThreeObject={nodeObject}
        onNodeClick={handleNodeClick}
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleSpeed={linkParticleSpeed}
        linkDirectionalParticleWidth={linkParticleWidth}
        linkDirectionalParticleColor={linkParticleColor}
        linkColor={linkColor}
        linkWidth={linkWidth}
      />
    </div>
  );
});
