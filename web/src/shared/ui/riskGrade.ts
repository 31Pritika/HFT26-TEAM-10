import type { RiskGrade } from "../types";

export function getRiskGrade(score: number): RiskGrade {
  if (score <= 20) return "A";
  if (score <= 40) return "B";
  if (score <= 60) return "C";
  if (score <= 80) return "D";
  return "F";
}

export const GRADE_CONFIG: Record<RiskGrade, { color: string; textClass: string; statusLabel: string }> = {
  A: { color: "var(--low)", textClass: "text-low", statusLabel: "posture: healthy" },
  B: { color: "var(--primary)", textClass: "text-primary", statusLabel: "posture: moderate" },
  C: { color: "var(--medium)", textClass: "text-medium", statusLabel: "posture: elevated" },
  D: { color: "var(--high)", textClass: "text-high", statusLabel: "posture: high" },
  F: { color: "var(--critical)", textClass: "text-critical", statusLabel: "posture: critical" },
};

export function getPosture(score: number, grade?: RiskGrade) {
  const { statusLabel, textClass } = GRADE_CONFIG[grade ?? getRiskGrade(score)];
  return { label: statusLabel, textClass };
}
