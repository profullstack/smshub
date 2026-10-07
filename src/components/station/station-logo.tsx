import Link from "next/link";

/**
 * The broadcast mark, drawn inline so it takes no request and scales cleanly.
 * Flat colours, no gradient: a gradient id shared by several inline copies
 * paints nothing when the first copy sits in a display:none element.
 */
export function StationMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeWidth="4.5">
        <path d="M38.36 25.64 A9 9 0 0 1 38.36 38.36" stroke="#ffa64d" />
        <path d="M25.64 25.64 A9 9 0 0 0 25.64 38.36" stroke="#ffa64d" />
        <path d="M43.31 20.69 A16 16 0 0 1 43.31 43.31" stroke="#f58410" opacity="0.8" />
        <path d="M20.69 20.69 A16 16 0 0 0 20.69 43.31" stroke="#f58410" opacity="0.8" />
        <path d="M48.26 15.74 A23 23 0 0 1 48.26 48.26" stroke="#d96a06" opacity="0.5" />
        <path d="M15.74 15.74 A23 23 0 0 0 15.74 48.26" stroke="#d96a06" opacity="0.5" />
      </g>
      <circle cx="32" cy="32" r="4.5" fill="#ffb85c" />
    </svg>
  );
}

export function StationLogo({
  href = "/",
  compact = false,
  className = "flex items-center gap-2.5",
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={className} aria-label="Number Station home">
      <StationMark className={compact ? "h-7 w-7" : "h-9 w-9"} />
      {!compact && (
        <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.28em] text-gray-100">
          Number<span className="text-blue-400"> Station</span>
        </span>
      )}
    </Link>
  );
}
