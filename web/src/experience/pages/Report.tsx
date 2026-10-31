import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Printer,
  Download,
  FileSpreadsheet,
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  Calendar,
  Layers,
  Bot,
  Activity,
  Cpu,
} from "lucide-react";
import { api } from "../../shared/api";
import type { ComplianceReport, Finding } from "../../shared/types";

export default function Report() {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState("7d");

  useEffect(() => {
    document.title = "Compliance Report · ShadowScope";
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchReport = async () => {
      setLoading(true);
      try {
        const data = await api.getReport(timeWindow);
        if (mounted) setReport(data);
      } catch (err) {
        console.error("Failed to load report:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchReport();
    return () => {
      mounted = false;
    };
  }, [timeWindow]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shadowscope-compliance-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!report) return;
    // Build CSV with Controls and Findings
    const rows = [
      ["SECTION", "ID", "NAME_OR_TITLE", "STATUS_OR_SEVERITY", "SCORE_OR_CONFIDENCE", "DETAILS"],
      ...report.frameworks.flatMap((fw) =>
        fw.controls.map((c) => [
          `Framework: ${fw.name}`,
          c.id,
          `"${c.name.replace(/"/g, '""')}"`,
          c.status.toUpperCase(),
          `${fw.score}%`,
          `"${c.evidence.replace(/"/g, '""')}"`,
        ])
      ),
      ...report.top_findings.map((f) => [
        "Finding",
        f.id,
        `"${f.title.replace(/"/g, '""')}"`,
        f.severity.toUpperCase(),
        `${Math.round(f.confidence * 100)}%`,
        `"${f.description.replace(/"/g, '""')} [Process: ${f.process_name || "N/A"}, Provider: ${f.provider_id || "N/A"}]"`,
      ]),
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const a = document.createElement("a");
    a.href = encodedUri;
    a.download = `shadowscope-compliance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "A":
        return { text: "text-emerald-400", ring: "var(--low)", bg: "bg-emerald-500/10", border: "border-emerald-500/40" };
      case "B":
        return { text: "text-primary", ring: "var(--primary)", bg: "bg-primary/10", border: "border-primary/40" };
      case "C":
        return { text: "text-warning", ring: "var(--medium)", bg: "bg-warning/10", border: "border-warning/40" };
      case "D":
        return { text: "text-high", ring: "var(--high)", bg: "bg-high/10", border: "border-high/40" };
      default:
        return { text: "text-danger", ring: "var(--critical)", bg: "bg-danger/10", border: "border-danger/40" };
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text">
        <div className="flex flex-col items-center gap-3">
          <Activity className="h-8 w-8 animate-spin text-primary" />
          <p className=" text-sm text-muted">Compiling cryptographic compliance audit report…</p>
        </div>
      </div>
    );
  }

  const gradeStyle = getGradeColor(report.overall.grade);

  return (
    <div className="min-h-screen bg-bg text-text print:bg-white print:text-black">
      {/* Print-Only Header */}
      <div className="hidden print:block mb-8 border-b-2 border-black pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-black">SHADOWSCOPE COMPLIANCE AUDIT REPORT</h1>
            <p className="text-xs text-gray-600 mt-1">Autonomous AI & Shadow IT Risk & Regulatory Attestation</p>
          </div>
          <div className="text-right text-xs text-gray-600">
            <div>Organization: {report.org}</div>
            <div>Generated: {new Date(report.generated_at).toLocaleDateString()}</div>
            <div>Audit Window: {report.window.from.slice(0, 10)} → {report.window.to.slice(0, 10)}</div>
          </div>
        </div>
      </div>

      {/* Screen Navigation & Action Bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 px-4 py-3 sm:px-8 print:hidden">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              to="/app"
              className="flex items-center gap-1.5 text-xs text-muted hover:text-text rounded-md px-2.5 py-1.5 border border-border bg-surface transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Console</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-text text-base">ShadowScope</span>
              <span className="text-xs text-primary px-2 py-0.5 rounded border border-primary/30 bg-primary/10">
                Audit Report
              </span>
            </div>
          </div>

          {/* Time Selector & Export Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border border-border bg-surface p-0.5 text-xs">
              {[
                { id: "24h", label: "24h" },
                { id: "7d", label: "7 Days" },
                { id: "30d", label: "30 Days" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTimeWindow(id)}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    timeWindow === id
                      ? "bg-cta text-on-cta font-semibold"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-solid text-xs text-text transition-colors"
              title="Print or Save as PDF"
            >
              <Printer className="h-3.5 w-3.5 text-primary" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-solid text-xs text-muted hover:text-text transition-colors"
              title="Export Full JSON"
            >
              <Download className="h-3.5 w-3.5" />
              <span>JSON</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-solid text-xs text-muted hover:text-text transition-colors"
              title="Export CSV Matrix"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Report Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 space-y-10 print:px-0 print:py-0 print:space-y-6">
        {/* SECTION 1: EXECUTIVE COVER & SCORECARD */}
        <section className="rounded-2xl border border-border bg-bg-2/80 p-6 sm:p-8 relative overflow-hidden print:border print:border-gray-300 print:bg-white print:p-6 print:shadow-none">
          {/* Subtle Cyber Grid Glow */}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Narrative */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-surface text-text">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  {report.org}
                </span>
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-surface text-muted">
                  <Calendar className="h-3.5 w-3.5" />
                  Window: {report.window.from.slice(0, 10)} to {report.window.to.slice(0, 10)}
                </span>
              </div>

              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-text print:text-black">
                AI Shadow IT & Regulatory Compliance Assessment
              </h2>

              <p className="text-sm sm:text-base text-muted leading-relaxed print:text-gray-700">
                {report.overall.summary} Passive telemetry inspection across enterprise endpoints detected unauthorized
                AI cloud integrations, unsanctioned code assistants, and unencrypted credentials transmitted in prompts.
              </p>

              {/* Stats Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-3">
                <div className="rounded-xl border border-border bg-surface/50 p-3 print:border-gray-200 print:bg-gray-50">
                  <div className="text-[11px] text-muted">Events Analyzed</div>
                  <div className=" text-base font-semibold text-text mt-0.5 print:text-black">
                    {report.stats.events.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface/50 p-3 print:border-gray-200 print:bg-gray-50">
                  <div className="text-[11px] text-muted">AI Requests</div>
                  <div className=" text-base font-semibold text-text mt-0.5 print:text-black">
                    {report.stats.ai_requests.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface/50 p-3 print:border-gray-200 print:bg-gray-50">
                  <div className="text-[11px] text-muted">Data Egress</div>
                  <div className=" text-base font-semibold text-text mt-0.5 print:text-black">
                    {formatBytes(report.stats.bytes_out)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface/50 p-3 print:border-gray-200 print:bg-gray-50">
                  <div className="text-[11px] text-muted">Shadow AI Tools</div>
                  <div className=" text-base font-semibold text-amber-400 mt-0.5 print:text-black">
                    {report.stats.shadow_tools}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface/50 p-3 print:border-gray-200 print:bg-gray-50">
                  <div className="text-[11px] text-muted">Open Findings</div>
                  <div className=" text-base font-semibold text-danger mt-0.5 print:text-black">
                    {report.stats.findings_open}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface/50 p-3 print:border-gray-200 print:bg-gray-50">
                  <div className="text-[11px] text-muted">Critical Leaks</div>
                  <div className=" text-base font-semibold text-danger mt-0.5 print:text-black">
                    {report.stats.critical}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Grade Badge with Circular Ring */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center p-4">
              <div className="relative flex items-center justify-center">
                {/* SVG Circular Ring */}
                <svg className="w-44 h-44 sm:w-48 sm:h-48 -rotate-90" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    className="stroke-surface-solid stroke-[8] fill-none print:stroke-gray-200"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    className="stroke-[8] fill-none transition-colors duration-1000 print:stroke-black"
                    stroke={gradeStyle.ring}
                    strokeDasharray={314.159}
                    strokeDashoffset={314.159 * (1 - report.overall.score / 100)}
                    strokeLinecap="round"
                  />
                </svg>

                {/* Grade Letter in Center */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className={`font-display text-5xl sm:text-6xl font-semibold ${gradeStyle.text} print:text-black`}>
                    {report.overall.grade}
                  </span>
                  <span className=" text-xs text-muted mt-1 print:text-gray-600">
                    Score: {report.overall.score}/100
                  </span>
                </div>
              </div>

              <div className="mt-4 text-center">
                <span
                  className={`inline-block text-xs font-semibold px-3 py-1 rounded-sm border ${gradeStyle.border} ${gradeStyle.bg} ${gradeStyle.text} print:border-black print:text-black`}
                >
                  Postured: Grade {report.overall.grade} ({report.overall.score}%)
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: FRAMEWORK SCORECARDS */}
        <section className="space-y-4 print:break-inside-avoid">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-xl font-semibold text-text print:text-black">Regulatory Framework Scorecards</h3>
              <p className="text-xs text-muted print:text-gray-600">
                Evaluation across data protection, privacy, credit card, and cybersecurity governance mandates
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {report.frameworks.map((fw) => {
              const passCount = fw.controls.filter((c) => c.status === "pass").length;
              const warnCount = fw.controls.filter((c) => c.status === "warn").length;
              const failCount = fw.controls.filter((c) => c.status === "fail").length;

              return (
                <div
                  key={fw.id}
                  className="rounded-xl border border-border bg-bg-2 p-5 flex flex-col justify-between print:border-gray-300 print:bg-white print:shadow-none print:break-inside-avoid"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-border pb-3 print:border-gray-200">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary print:text-black">{fw.id}</span>
                          <span className="text-[11px] text-muted">Mandate</span>
                        </div>
                        <h4 className="font-display font-semibold text-text text-sm mt-0.5 print:text-black">
                          {fw.name}
                        </h4>
                      </div>
                      <div className="text-right">
                        <span className=" text-base font-semibold text-text print:text-black">{fw.score}%</span>
                        <div className="text-[11px] text-muted">Pass Rate</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="my-3 h-1.5 w-full rounded-sm bg-surface-solid overflow-hidden print:bg-gray-200">
                      <div
                        className="h-full rounded-sm transition-colors duration-700"
                        style={{
                          width: `${fw.score}%`,
                          backgroundColor:
                            fw.score >= 80 ? "var(--low)" : fw.score >= 60 ? "var(--medium)" : "var(--critical)",
                        }}
                      />
                    </div>

                    {/* Controls List */}
                    <div className="space-y-2.5 mt-3">
                      {fw.controls.map((ctrl) => (
                        <div
                          key={ctrl.id}
                          className="rounded-lg border border-border/60 bg-surface/40 p-2.5 text-xs print:border-gray-200 print:bg-gray-50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-text truncate print:text-black">
                              {ctrl.id}: {ctrl.name}
                            </span>
                            <span
                              className={`shrink-0 flex items-center gap-1 text-[11px]  font-semibold px-1.5 py-0.5 rounded ${
                                ctrl.status === "pass"
                                  ? "border border-emerald-500/30 bg-emerald-500/10 text-text"
                                  : ctrl.status === "warn"
                                  ? "border border-warning/30 bg-warning/10 text-text"
                                  : "border border-danger/30 bg-danger/10 text-text"
                              } print:border-gray-400 print:text-black`}
                            >
                              {ctrl.status === "pass" ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : ctrl.status === "warn" ? (
                                <AlertTriangle className="h-3 w-3" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              {ctrl.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted mt-1 leading-snug print:text-gray-600">
                            Evidence: {ctrl.evidence}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary Footer */}
                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted print:border-gray-200">
                    <span>Summary:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">{passCount} Pass</span>
                      <span>·</span>
                      <span className="text-warning">{warnCount} Warn</span>
                      <span>·</span>
                      <span className="text-danger">{failCount} Fail</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 3: TOP FINDINGS & SENSITIVE DATA LEAKS */}
        <section className="space-y-4 print:break-inside-avoid">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-xl font-semibold text-text print:text-black">Top Critical Findings & Telemetry Leaks</h3>
              <p className="text-xs text-muted print:text-gray-600">
                Validated exfiltration events requiring immediate containment or credential rotation
              </p>
            </div>
            <span className=" text-xs text-danger font-semibold">
              {report.top_findings.length} High-Risk Incidents
            </span>
          </div>

          <div className=" rounded-xl border border-border bg-bg-2 print:border-gray-300 print:bg-white print:shadow-none">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface/80 text-muted text-[11px] print:border-gray-300 print:bg-gray-100 print:text-black">
                  <th className="p-3">Severity</th>
                  <th className="p-3">Title & Classification</th>
                  <th className="p-3">Origin / Destination</th>
                  <th className="p-3">Redacted Evidence</th>
                  <th className="p-3">Violated Frameworks</th>
                  <th className="p-3">Remediation Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 print:divide-gray-200">
                {report.top_findings.slice(0, 8).map((finding: Finding) => (
                  <tr key={finding.id} className="hover:bg-surface/30 transition-colors print:hover:bg-transparent">
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]  font-semibold ${
                          finding.severity === "critical"
                            ? "border border-danger/40 bg-danger/10 text-text"
                            : finding.severity === "high"
                            ? "border border-amber-500/40 bg-amber-500/10 text-text"
                            : "border border-warning/40 bg-warning/10 text-text"
                        } print:border-black print:text-black`}
                      >
                        <ShieldAlert className="h-3 w-3" />
                        {finding.severity}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-text text-xs print:text-black">{finding.title}</div>
                      <div className="text-[11px] text-muted capitalize mt-0.5">
                        {finding.type} · {finding.subtype.replace(/_/g, " ")}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-text print:text-black">
                        <Cpu className="h-3 w-3 text-muted" />
                        <span>{finding.process_name || "Unknown"}</span>
                      </div>
                      <div className="text-[11px] text-primary truncate mt-0.5">
                        → {finding.provider_id || "Direct IP / Gateway"}
                      </div>
                    </td>
                    <td className="p-3">
                      <code className="px-2 py-1 rounded border border-border bg-surface-solid text-amber-300 text-[11px] block max-w-xs truncate print:border-gray-300 print:bg-gray-100 print:text-black">
                        {finding.evidence.redacted_snippet}
                      </code>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {finding.compliance.map((c) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 rounded border border-border bg-surface text-[11px] text-muted print:border-gray-300 print:text-black"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-[11px] text-muted print:text-gray-700 max-w-xs">
                      {finding.remediation && finding.remediation[0] ? (
                        <span>{finding.remediation[0]}</span>
                      ) : (
                        <span>Review data policy & rotate key</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 4: SHADOW AI INVENTORY & AUTONOMOUS AGENTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:block print:space-y-6">
          {/* Shadow AI Inventory */}
          <section className="space-y-4 print:break-inside-avoid">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold text-text print:text-black flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Shadow AI Inventory
                </h3>
                <p className="text-xs text-muted print:text-gray-600">Discovered AI models & desktop assistants</p>
              </div>
              <span className=" text-xs text-muted">
                {report.inventory.length} Discovered
              </span>
            </div>

            <div className=" rounded-xl border border-border bg-bg-2 p-1 print:border-gray-300 print:bg-white print:shadow-none">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/50 text-[11px] text-muted print:border-gray-200 print:text-black">
                    <th className="p-2.5">Process</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">Traffic</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-right">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 print:divide-gray-200">
                  {report.inventory.map((item) => (
                    <tr key={item.id} className="hover:bg-surface/20">
                      <td className="p-2.5">
                        <div className="font-semibold text-text print:text-black">{item.process_name}</div>
                        <div className="text-[11px] text-muted truncate">{item.provider_ids.join(", ")}</div>
                      </td>
                      <td className="p-2.5 capitalize text-muted">{item.category.replace(/_/g, " ")}</td>
                      <td className="p-2.5 text-muted">
                        <div>{item.request_count} reqs</div>
                        <div className="text-[11px]">{formatBytes(item.bytes_out)}</div>
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px]  font-semibold ${
                            item.sanctioned
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-text"
                              : "border border-danger/30 bg-danger/10 text-text"
                          } print:border-black print:text-black`}
                        >
                          {item.sanctioned ? "Sanctioned" : "Shadow AI"}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-semibold text-text print:text-black">
                        {item.risk_score}/100
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Autonomous Agents Audit */}
          <section className="space-y-4 print:break-inside-avoid">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold text-text print:text-black flex items-center gap-2">
                  <Bot className="h-4 w-4 text-accent" />
                  Autonomous Agent Sessions
                </h3>
                <p className="text-xs text-muted print:text-gray-600">Active agent loops & tool permissions</p>
              </div>
              <span className=" text-xs text-muted">
                {report.agents.length} Monitored
              </span>
            </div>

            <div className=" rounded-xl border border-border bg-bg-2 p-1 print:border-gray-300 print:bg-white print:shadow-none">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/50 text-[11px] text-muted print:border-gray-200 print:text-black">
                    <th className="p-2.5">Agent / Process</th>
                    <th className="p-2.5">Permissions Matrix</th>
                    <th className="p-2.5">Autonomy</th>
                    <th className="p-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 print:divide-gray-200">
                  {report.agents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-surface/20">
                      <td className="p-2.5">
                        <div className="font-semibold text-text print:text-black capitalize">
                          {agent.framework.replace(/_/g, " ")} ({agent.id})
                        </div>
                        <div className="text-[11px] text-muted">PID {agent.pid || "N/A"} · {agent.process_name}</div>
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1 text-[11px]">
                          <span
                            className={`px-1 py-0.5 rounded ${
                              agent.permissions.shell
                                ? "bg-danger/20 text-text font-semibold"
                                : "bg-surface text-muted"
                            }`}
                            title="Shell Access"
                          >
                            SH
                          </span>
                          <span
                            className={`px-1 py-0.5 rounded ${
                              agent.permissions.filesystem_write
                                ? "bg-warning/20 text-text font-semibold"
                                : "bg-surface text-muted"
                            }`}
                            title="FS Write"
                          >
                            FS-W
                          </span>
                          <span
                            className={`px-1 py-0.5 rounded ${
                              agent.permissions.network
                                ? "bg-primary/20 text-primary font-semibold"
                                : "bg-surface text-muted"
                            }`}
                            title="Network Socket"
                          >
                            NET
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5 font-semibold text-text print:text-black">
                        {agent.autonomy_score}%
                      </td>
                      <td className="p-2.5 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px]  font-semibold ${
                            agent.status === "blocked"
                              ? "border border-danger/30 bg-danger/10 text-text"
                              : agent.status === "active"
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-text"
                              : "border border-border bg-surface text-muted"
                          } print:border-black print:text-black`}
                        >
                          {agent.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* SECTION 5: PRIORITIZED RECOMMENDATIONS (P0/P1/P2) */}
        <section className="space-y-4 print:break-inside-avoid">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-xl font-semibold text-text print:text-black">Prioritized Remediation Roadmap</h3>
              <p className="text-xs text-muted print:text-gray-600">Actionable steps to reach compliance Grade A</p>
            </div>
            <span className=" text-xs text-muted">
              {report.recommendations.length} Directives
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.recommendations.map((rec, index) => (
              <div
                key={index}
                className={`rounded-xl border p-5 transition-colors ${
                  rec.priority === "P0"
                    ? "border-danger/40 bg-danger/5 print:border-red-400 print:bg-white"
                    : rec.priority === "P1"
                    ? "border-amber-500/40 bg-amber-500/5 print:border-yellow-400 print:bg-white"
                    : "border-primary/40 bg-primary/5 print:border-cyan-400 print:bg-white"
                } print:shadow-none print:break-inside-avoid`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={` text-xs font-semibold px-2 py-0.5 rounded ${
                        rec.priority === "P0"
                          ? "bg-danger text-bg"
                          : rec.priority === "P1"
                          ? "bg-amber-500 text-bg"
                          : "bg-cta text-on-cta"
                      }`}
                    >
                      {rec.priority}
                    </span>
                    <h4 className="font-display font-semibold text-text text-sm sm:text-base print:text-black">
                      {rec.title}
                    </h4>
                  </div>
                  {rec.priority === "P0" && <ShieldAlert className="h-4 w-4 text-danger shrink-0" />}
                </div>

                <p className="text-xs sm:text-sm text-muted leading-relaxed print:text-gray-700">
                  {rec.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 6: AUDIT ATTESTATION FOOTER */}
        <section className="border-t border-border pt-6 pb-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted print:border-black print:text-black">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary print:text-black" />
            <span>Cryptographically sealed by ShadowScope Kernel Engine v0.1.0</span>
          </div>
          <div>
            <span>Audit Ref: SS-AUD-{report.generated_at.slice(0, 10)}-{report.overall.grade} · Team git push n pray</span>
          </div>
        </section>
      </main>
    </div>
  );
}
