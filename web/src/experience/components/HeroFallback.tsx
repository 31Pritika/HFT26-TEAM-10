

export function HeroFallback({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Animated gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(34,211,238,0.12) 0%, rgba(139,92,246,0.08) 40%, transparent 70%)",
        }}
      />
      {/* Conic sweep animation */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            "conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(34,211,238,0.4) 20deg, transparent 40deg)",
          animation: "sweepRotate 8s linear infinite",
        }}
      />
      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,255,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Background text watermark */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        style={{
          fontSize: "clamp(3rem, 12vw, 10rem)",
          fontFamily: "Space Grotesk, sans-serif",
          fontWeight: 900,
          letterSpacing: "0.15em",
          color: "transparent",
          WebkitTextStroke: "1px rgba(34,211,238,0.06)",
          opacity: 0.5,
          whiteSpace: "nowrap",
        }}
      >
        SHADOW SCOPE
      </div>
      {/* Particles */}
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: `${3 + (i % 4)}px`,
            height: `${3 + (i % 4)}px`,
            left: `${((i * 37 + 11) % 90) + 5}%`,
            top: `${((i * 53 + 7) % 80) + 10}%`,
            background:
              i % 3 === 0
                ? "var(--primary)"
                : i % 3 === 1
                ? "var(--accent)"
                : "var(--critical)",
            boxShadow: `0 0 ${6 + (i % 3) * 4}px currentColor`,
            animation: `particleFloat ${3 + (i % 4)}s ease-in-out ${
              i * 0.4
            }s infinite alternate`,
            opacity: 0.6 + (i % 4) * 0.1,
          }}
        />
      ))}
      {/* SVG network lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-10"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line
          x1="20%"
          y1="30%"
          x2="50%"
          y2="50%"
          stroke="#22D3EE"
          strokeWidth="1"
          strokeDasharray="4 4"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="0;-16"
            dur="2s"
            repeatCount="indefinite"
          />
        </line>
        <line
          x1="80%"
          y1="25%"
          x2="50%"
          y2="50%"
          stroke="#8B5CF6"
          strokeWidth="1"
          strokeDasharray="4 4"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="0;-16"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </line>
        <line
          x1="15%"
          y1="70%"
          x2="50%"
          y2="50%"
          stroke="#22D3EE"
          strokeWidth="1"
          strokeDasharray="4 4"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="0;-16"
            dur="3s"
            repeatCount="indefinite"
          />
        </line>
        <line
          x1="85%"
          y1="65%"
          x2="50%"
          y2="50%"
          stroke="#8B5CF6"
          strokeWidth="1"
          strokeDasharray="4 4"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="0;-16"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </line>
      </svg>
      <style>{`
        @keyframes sweepRotate { to { transform: rotate(360deg); } }
        @keyframes particleFloat {
          from { transform: translateY(0px) scale(1); opacity: 0.6; }
          to { transform: translateY(-20px) scale(1.3); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
