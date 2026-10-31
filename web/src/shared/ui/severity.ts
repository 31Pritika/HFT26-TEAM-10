import type { ComponentType } from "react";
import { ShieldAlert, AlertTriangle, AlertCircle, ShieldCheck, Info } from "lucide-react";
import type { Severity } from "../types";

/** Severity colours fail contrast on their own tints, so pills keep primary text and colour the rest. */
export const SEVERITY_META: Record<
  Severity,
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
    pillClass: string;
    iconClass: string;
    barClass: string;
  }
> = {
  critical: {
    label: "CRITICAL",
    icon: ShieldAlert,
    pillClass: "bg-critical/10 border-critical/50",
    iconClass: "text-critical",
    barClass: "bg-critical",
  },
  high: {
    label: "HIGH",
    icon: AlertTriangle,
    pillClass: "bg-high/10 border-high/50",
    iconClass: "text-high",
    barClass: "bg-high",
  },
  medium: {
    label: "MEDIUM",
    icon: AlertCircle,
    pillClass: "bg-medium/10 border-medium/50",
    iconClass: "text-medium",
    barClass: "bg-medium",
  },
  low: {
    label: "LOW",
    icon: ShieldCheck,
    pillClass: "bg-low/10 border-low/50",
    iconClass: "text-low",
    barClass: "bg-low",
  },
  info: {
    label: "INFO",
    icon: Info,
    pillClass: "bg-info/10 border-info/50",
    iconClass: "text-info",
    barClass: "bg-info",
  },
};
