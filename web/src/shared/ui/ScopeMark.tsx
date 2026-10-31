/** The ShadowScope mark: crop corners around a lens. Same drawing as public/favicon.svg. */
export function ScopeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path d="M3 10V3h7M22 3h7v7M29 22v7h-7M10 29H3v-7" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="6.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14.5" y="14.5" width="3" height="3" fill="currentColor" />
    </svg>
  );
}
