import type { ReactNode } from "react";

export function GlassCard({ children }: { children: ReactNode }) {
  return <div className="rounded border border-border bg-surface p-6 backdrop-blur-xl">{children}</div>;
}
