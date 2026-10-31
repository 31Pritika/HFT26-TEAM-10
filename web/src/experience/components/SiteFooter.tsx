import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-bg py-12 px-4 sm:px-6 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="16" r="2.5" fill="currentColor" />
          </svg>
          <span className="font-display font-medium text-sm text-text">
            Shadow<span className="text-primary">Scope</span>
          </span>
        </div>

        {/* Team credit */}
        <div className="text-center">
          <p className="text-xs sm:text-sm font-mono text-muted">
            Built by{" "}
            <span className="font-semibold text-primary">
              git push n pray
            </span>{" "}
            at{" "}
            <span className="text-text">Hacktoberfest @ CBIT</span>
          </p>
          <p className="text-xs mt-1 text-faint">
            Team 10 · 16-hour hackathon · 2026
          </p>
        </div>

        {/* Links */}
        <nav className="flex flex-wrap items-center justify-center gap-5 text-xs text-muted" aria-label="Footer Navigation">
          <Link
            to="/app"
            className="transition-colors hover:text-text"
          >
            Console
          </Link>
          <Link
            to="/playground"
            className="transition-colors hover:text-text"
          >
            Playground
          </Link>
          <Link
            to="/architecture"
            className="transition-colors hover:text-text"
          >
            Architecture
          </Link>
          <Link
            to="/report"
            className="transition-colors hover:text-text"
          >
            Report
          </Link>
          <a
            href="https://github.com/31Pritika/HFT26-TEAM-10"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-text"
            aria-label="GitHub repository"
          >
            <GithubIcon className="w-3.5 h-3.5" />
            GitHub
            <ExternalLink className="w-3 h-3 text-faint" aria-hidden="true" />
          </a>
        </nav>
      </div>
    </footer>
  );
}
