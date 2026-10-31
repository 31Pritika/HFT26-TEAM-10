import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface MagneticButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

/**
 * Replaces magnetic animation with an accessible, keyboard-focusable Link or Button.
 * Uses React Router client-side routing for internal links to eliminate full-page reloads.
 */
export function MagneticButton({
  children,
  className = "",
  onClick,
  href,
  disabled,
}: MagneticButtonProps) {
  const isInternal = href && (href.startsWith("/") || href.startsWith("#"));

  const baseStyles =
    "inline-flex items-center justify-center font-medium select-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary rounded-[var(--radius)]";

  if (href) {
    if (isInternal) {
      return (
        <Link
          to={href}
          className={`${baseStyles} ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`}
          onClick={onClick}
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseStyles} ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${baseStyles} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      {children}
    </button>
  );
}
