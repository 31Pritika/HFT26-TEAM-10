import { useEffect, useRef, useState, useMemo } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import type { GraphNode, GraphLink } from "./NodeDetailPanel";

interface Constellation3DProps {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode) => void;
  autoRotate?: boolean;
  reducedMotion?: boolean;
}

export function Constellation3D({
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

  // Color mapping helper
  const getNodeColorHex = (risk: number) => {
    if (risk >= 80) return "#df6a68"; // Critical
    if (risk >= 50) return "#d4915a"; // High
    if (risk >= 20) return "#c9b467"; // Medium
    return "#bad6f7"; // Low
  };

  const getLinkColorRgba = (risk: number, opacity = 0.3) => {
    if (risk >= 80) return `rgba(223,106,104, ${opacity})`;
    if (risk >= 50) return `rgba(212,145,90, ${opacity})`;
    if (risk >= 20) return `rgba(201,180,103, ${opacity})`;
    return `rgba(186,215,247, ${opacity})`;
  };

  // Formatted graph data for react-force-graph-3d
  const graphData = useMemo(() => {
    return {
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    };
  }, [nodes, links]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[550px] bg-[#0b0d13] overflow-hidden">
      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        backgroundColor="#0b0d13"
        showNavInfo={false}
        enableNodeDrag={true}
        nodeLabel={(node: any) =>
          `<div style="background: rgba(11, 13, 20, 0.95); border: 1px solid rgba(255, 255, 255, 0.15); padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; color: #E6EDF3; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-weight: 600; color: #bad6f7;">${node.label}</div>
            <div style="color: #8B949E; text-transform: uppercase; font-size: 9px;">${node.kind} · Risk ${node.risk}/100</div>
          </div>`
        }
        nodeThreeObject={(node: any) => {
          const group = new THREE.Group();
          const colorHex = getNodeColorHex(node.risk);
          const color = new THREE.Color(colorHex);

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

          // Outer glowing wireframe or halo for providers and high risks
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
            ctx.font = "bold 22px 'JetBrains Mono', monospace";
            ctx.fillStyle = node.risk >= 80 ? "#df6a68" : "#E6EDF3";
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
        }}
        onNodeClick={(node: any) => onSelectNode(node as GraphNode)}
        linkDirectionalParticles={(link: any) =>
          reducedMotion ? 0 : Math.max(1, Math.min(5, Math.ceil((link.weight || 1) * 1.2)))
        }
        linkDirectionalParticleSpeed={(link: any) => 0.005 + (link.risk || 0) * 0.00012}
        linkDirectionalParticleWidth={() => 2.4}
        linkDirectionalParticleColor={(link: any) => getNodeColorHex(link.risk)}
        linkColor={(link: any) => getLinkColorRgba(link.risk, 0.28)}
        linkWidth={(link: any) => Math.max(0.8, Math.min(2.8, (link.weight || 1) * 0.35))}
      />
    </div>
  );
}

