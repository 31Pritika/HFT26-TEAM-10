import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ShieldAlert, Check, ExternalLink } from "lucide-react";
import { useAppStore } from "../shared/store";
import { SeverityPill } from "../shared/ui/SeverityPill";

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { unreadCriticals, markCriticalRead, clearUnreadCriticals } = useAppStore();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleOpenAlert = (id: string) => {
    markCriticalRead(id);
    setOpen(false);
    navigate(`/app/alerts/${id}`);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-muted hover:text-text hover:bg-white/[0.08] transition-colors cursor-pointer"
        aria-label="Critical notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCriticals.length > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 font-mono text-[10px] font-bold text-white  animate-pulse">
            {unreadCriticals.length > 9 ? "9+" : unreadCriticals.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-[var(--radius)] border border-border-strong bg-surface p-0 shadow-2xl  z-50">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span className="font-display text-sm font-semibold text-text">Critical Alerts</span>
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-red-400">
                {unreadCriticals.length}
              </span>
            </div>
            {unreadCriticals.length > 0 && (
              <button
                onClick={clearUnreadCriticals}
                className="flex items-center gap-1 text-xs text-muted hover:text-text transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Dismiss all</span>
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.06]">
            {unreadCriticals.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">
                <p className="font-medium text-text mb-1">All Clear</p>
                <p>No unacknowledged critical exfiltrations detected.</p>
              </div>
            ) : (
              unreadCriticals.map((finding) => (
                <div
                  key={finding.id}
                  onClick={() => handleOpenAlert(finding.id)}
                  className="p-3.5 hover:bg-white/[0.06] transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <SeverityPill severity={finding.severity} size="xs" />
                    <span className="font-mono text-[10px] text-muted">
                      {new Date(finding.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-text group-hover:text-primary transition-colors line-clamp-1">
                    {finding.title}
                  </p>
                  <p className="text-[11px] text-muted line-clamp-1 mt-0.5">
                    {finding.evidence?.redacted_snippet || finding.description}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-muted">
                    <span>{finding.process_name ?? "unknown"}</span>
                    <span className="flex items-center gap-1 text-primary group-hover:underline">
                      Investigate <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border p-2.5 text-center bg-white/[0.02]">
            <button
              onClick={() => {
                setOpen(false);
                navigate("/app/alerts?severity=critical");
              }}
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              View all critical alerts in Alerts Center →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

