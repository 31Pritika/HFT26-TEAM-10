/**
 * HeroScene3D — lazy-loaded react-three-fiber scene.
 * Glass point-cloud sphere, laptop nodes, AI-provider orbs,
 * cyan scanning ring intercepting data packets.
 * Pauses when off-screen. Mouse parallax. dpr [1, 1.5].
 */
import { useRef, useState, useEffect, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

// ── helpers ──────────────────────────────────────────────────────────────────

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function spherePoint(radius: number): [number, number, number] {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
  ];
}

// ── Point cloud sphere ────────────────────────────────────────────────────────

function PointCloud({ count = 420 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < count; i++) {
      const [x, y, z] = spherePoint(2.2 + rand(-0.15, 0.15));
      pos.push(x, y, z);
      const t = Math.random();
      if (t < 0.6) col.push(0.13, 0.83, 0.93); // cyan
      else if (t < 0.85) col.push(0.55, 0.36, 0.96); // violet
      else col.push(0.9, 0.92, 0.96); // white
    }
    return { positions: new Float32Array(pos), colors: new Float32Array(col) };
  }, [count]);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.05;
      ref.current.rotation.x += delta * 0.015;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.022}
        vertexColors
        transparent
        opacity={0.82}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// ── Wire-frame sphere (glass) ─────────────────────────────────────────────────

function GlassSphere() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y -= delta * 0.04;
    }
  });
  return (
    <mesh ref={ref} renderOrder={0}>
      <sphereGeometry args={[2.18, 32, 32]} />
      <meshStandardMaterial
        color="#22D3EE"
        wireframe
        transparent
        opacity={0.06}
      />
    </mesh>
  );
}

// ── Scanning ring ─────────────────────────────────────────────────────────────

function ScanningRing({
  ringYRef,
}: {
  ringYRef?: React.MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const angleRef = useRef(0);

  useFrame((_, delta) => {
    angleRef.current += delta * 0.9;
    const y = Math.sin(angleRef.current) * 2.4;
    if (ringYRef) ringYRef.current = y;
    if (ref.current) ref.current.position.y = y;
    if (glowRef.current) glowRef.current.position.y = y;
  });

  return (
    <group>
      <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.4, 0.012, 16, 80]} />
        <meshStandardMaterial
          color="#22D3EE"
          emissive="#22D3EE"
          emissiveIntensity={4}
          transparent
          opacity={0.95}
        />
      </mesh>
      {/* Glow ring */}
      <mesh ref={glowRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.4, 0.06, 8, 80]} />
        <meshStandardMaterial
          color="#22D3EE"
          emissive="#22D3EE"
          emissiveIntensity={1.5}
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Data packets ──────────────────────────────────────────────────────────────

interface PacketState {
  id: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  t: number;
  speed: number;
  intercepted: boolean;
  color: string;
}

function DataPacket({
  packet,
  ringYRef,
}: {
  packet: PacketState;
  ringYRef?: React.MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Mesh>(null);
  const [flashed, setFlashed] = useState(false);

  useFrame(() => {
    if (ref.current) {
      const pos = packet.start.clone().lerp(packet.end, Math.min(packet.t, 1));
      ref.current.position.copy(pos);
      if (trailRef.current) trailRef.current.position.copy(pos);

      if (ringYRef && packet.intercepted && Math.abs(pos.y - ringYRef.current) < 0.45) {
        if (!flashed) {
          setFlashed(true);
        }
      }
    }
  });

  const isRed = packet.intercepted && flashed;
  const color = isRed ? "#FF3B5C" : "#22D3EE";

  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isRed ? 10 : 6}
        />
      </mesh>
      <mesh ref={trailRef}>
        <sphereGeometry args={[0.1, 6, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isRed ? 3 : 1.5}
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Provider orbs ─────────────────────────────────────────────────────────────

const PROVIDERS = [
  { label: "OpenAI", pos: [3.4, 1.2, 0.5] as [number, number, number], color: "#10A37F" },
  { label: "Anthropic", pos: [-3.2, 0.8, -0.8] as [number, number, number], color: "#D97706" },
  { label: "Ollama", pos: [2.6, -1.6, -1.2] as [number, number, number], color: "#8B5CF6" },
  { label: "HuggingFace", pos: [-2.8, -1.4, 0.6] as [number, number, number], color: "#FF9D00" },
];

function ProviderOrb({
  label,
  pos,
  color,
}: {
  label: string;
  pos: [number, number, number];
  color: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const floatOffset = useRef(Math.random() * Math.PI * 2);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + floatOffset.current;
    if (ref.current) {
      ref.current.position.set(pos[0], pos[1] + Math.sin(t * 0.6) * 0.12, pos[2]);
    }
    if (glowRef.current) {
      glowRef.current.position.set(pos[0], pos[1] + Math.sin(t * 0.6) * 0.12, pos[2]);
      const s = 1 + Math.sin(t * 1.2) * 0.06;
      glowRef.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      <mesh ref={ref} position={pos}>
        <sphereGeometry args={[0.22, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.8}
          roughness={0.1}
          metalness={0.3}
        />
      </mesh>
      {/* Outer glow */}
      <mesh ref={glowRef} position={pos}>
        <sphereGeometry args={[0.38, 10, 10]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>
      {/* Label */}
      <Html position={[pos[0], pos[1] - 0.42, pos[2]]} center distanceFactor={7}>
        <span
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: "10px",
            color: "#E8ECF5",
            background: "rgba(5,6,10,0.75)",
            border: `1px solid ${color}55`,
            padding: "2px 6px",
            borderRadius: "4px",
            whiteSpace: "nowrap",
            userSelect: "none",
            backdropFilter: "blur(4px)",
          }}
        >
          {label}
        </span>
      </Html>
    </group>
  );
}

// ── Laptop node ───────────────────────────────────────────────────────────────

function LaptopNode({ pos }: { pos: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const floatRef = useRef(Math.random() * Math.PI * 2);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + floatRef.current;
    if (ref.current) {
      ref.current.position.set(pos[0], pos[1] + Math.sin(t * 0.5) * 0.08, pos[2]);
    }
  });

  return (
    <group ref={ref} position={pos}>
      {/* Screen */}
      <mesh position={[0, 0.08, 0]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[0.28, 0.2, 0.015]} />
        <meshStandardMaterial color="#111627" emissive="#22D3EE" emissiveIntensity={0.6} />
      </mesh>
      {/* Base */}
      <mesh position={[0, -0.025, 0.04]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.28, 0.015, 0.22]} />
        <meshStandardMaterial color="#1a1f35" />
      </mesh>
    </group>
  );
}

// ── Packet manager (spawns & updates packets) ─────────────────────────────────

function PacketManager({
  ringYRef,
}: {
  ringYRef?: React.MutableRefObject<number>;
}) {
  const [packets, setPackets] = useState<PacketState[]>([]);
  const packetsRef = useRef<PacketState[]>([]);
  const nextIdRef = useRef(0);
  const timeSinceSpawnRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  const laptopPositions: [number, number, number][] = [
    [-1.2, -0.4, 2.8],
    [0.8, -0.8, 2.6],
    [1.8, 0.3, 2.2],
  ];

  const providerPositions: [number, number, number][] = PROVIDERS.map((p) => p.pos);

  useFrame((_, delta) => {
    timeSinceSpawnRef.current += delta;
    let changed = false;

    if (timeSinceSpawnRef.current > 0.45 && packetsRef.current.length < 14) {
      timeSinceSpawnRef.current = 0;
      const start = new THREE.Vector3(
        ...laptopPositions[Math.floor(Math.random() * laptopPositions.length)]
      );
      const end = new THREE.Vector3(
        ...providerPositions[Math.floor(Math.random() * providerPositions.length)]
      );
      packetsRef.current.push({
        id: nextIdRef.current++,
        start,
        end,
        t: 0,
        speed: rand(0.3, 0.55),
        intercepted: Math.random() < 0.4,
        color: "#22D3EE",
      });
      changed = true;
    }

    const prevCount = packetsRef.current.length;
    packetsRef.current.forEach((p) => {
      p.t += delta * p.speed;
    });
    packetsRef.current = packetsRef.current.filter((p) => p.t < 1.05);

    if (packetsRef.current.length !== prevCount || changed) {
      setPackets([...packetsRef.current]);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Laptops */}
      {laptopPositions.map((pos, i) => (
        <LaptopNode key={i} pos={pos} />
      ))}
      {/* Providers */}
      {PROVIDERS.map((p) => (
        <ProviderOrb key={p.label} {...p} />
      ))}
      {/* Dynamic Data Packets */}
      {packets.map((packet) => (
        <DataPacket key={packet.id} packet={packet} ringYRef={ringYRef} />
      ))}
    </group>
  );
}

// ── Mouse parallax controller ─────────────────────────────────────────────────

function ParallaxGroup({
  mouseX,
  mouseY,
  children,
}: {
  mouseX: number;
  mouseY: number;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      const targetRX = mouseY * 0.15;
      const targetRY = mouseX * 0.25;
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        targetRX,
        delta * 3
      );
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        targetRY,
        delta * 3
      );
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

// ── Scene content ─────────────────────────────────────────────────────────────

function SceneContent({
  mouseX,
  mouseY,
}: {
  mouseX: number;
  mouseY: number;
}) {
  const ringYRef = useRef(0);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 4, 4]} intensity={1.2} color="#22D3EE" />
      <pointLight position={[0, -4, -4]} intensity={0.6} color="#8B5CF6" />
      <pointLight position={[4, 0, 0]} intensity={0.4} color="#0EA5E9" />
      <ParallaxGroup mouseX={mouseX} mouseY={mouseY}>
        <GlassSphere />
        <PointCloud count={400} />
        <ScanningRing ringYRef={ringYRef} />
        <PacketManager ringYRef={ringYRef} />
      </ParallaxGroup>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface HeroScene3DProps {
  className?: string;
}

export function HeroScene3D({ className = "" }: HeroScene3DProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);

  // Pause when off-screen
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY, currentTarget } = e;
    const { width, height, left, top } = (currentTarget as HTMLElement).getBoundingClientRect();
    setMouseX(((clientX - left) / width - 0.5) * 2);
    setMouseY(-(((clientY - top) / height - 0.5) * 2));
  };

  return (
    <div
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { setMouseX(0); setMouseY(0); }}
      aria-hidden="true"
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 7], fov: 52 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
        frameloop={visible ? "always" : "never"}
      >
        <Suspense fallback={null}>
          <SceneContent mouseX={mouseX} mouseY={mouseY} />
        </Suspense>
      </Canvas>
    </div>
  );
}
