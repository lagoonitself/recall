interface LogoMarkProps {
  size?: number;
  /** Gentle breathing loop, used while the assistant is working. */
  pulse?: boolean;
  className?: string;
}

/**
 * Recall mark: a solid geometric "R" built from three primitives —
 * a stem, a half-disc bowl and a straight leg. Drawn in currentColor so it is
 * black on light surfaces and white on dark ones.
 */
export function LogoMark({ size = 24, pulse = false, className = '' }: LogoMarkProps) {
  return (
    <svg
      className={`logo-mark ${pulse ? 'logo-mark-pulse' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path className="logo-mark-stem" d="M3 2h5.5v20H3z" />
      <path className="logo-mark-bowl" d="M10 2h3.5a6 6 0 0 1 0 12H10z" />
      <path className="logo-mark-leg" d="M12.6 15.4h5.6L22 22h-5.6z" />
    </svg>
  );
}

interface LogoProps {
  size?: number;
  pulse?: boolean;
  className?: string;
}

/** Mark + wordmark. */
export function Logo({ size = 20, pulse = false, className = '' }: LogoProps) {
  return (
    <span className={`logo ${className}`}>
      <LogoMark size={size} pulse={pulse} />
      <span className="logo-word">Recall</span>
    </span>
  );
}
