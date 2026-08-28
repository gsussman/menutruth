type MarkProps = {
  size?: number;
  className?: string;
  /** All-black version for mono contexts */
  mono?: boolean;
};

const GREEN = "#00A878";
const RED = "#F25F5C";
const NAVY = "#172A3A";

/** Dual-bar mark: kitchen (green, shorter) vs app (red, longer). */
export function LogoMark({ size = 36, className, mono = false }: MarkProps) {
  const top = mono ? "#000000" : GREEN;
  const bottom = mono ? "#000000" : RED;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Top: shorter green, left-shifted */}
      <rect x="4" y="12" width="20" height="5" rx="2.5" fill={top} />
      {/* Bottom: longer red, right-shifted */}
      <rect x="10" y="23" width="26" height="5" rx="2.5" fill={bottom} />
    </svg>
  );
}

type WordmarkProps = {
  className?: string;
  mono?: boolean;
  /** Show tagline under the name */
  showTagline?: boolean;
  taglineClassName?: string;
};

export function LogoWordmark({
  className,
  mono = false,
  showTagline = false,
  taglineClassName,
}: WordmarkProps) {
  return (
    <div className={className}>
      <span
        className="text-2xl sm:text-[1.75rem] font-bold tracking-tight leading-none"
        style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
      >
        <span style={{ color: mono ? "#000000" : NAVY }}>Menu</span>
        <span style={{ color: mono ? "#000000" : GREEN }}>Truth</span>
      </span>
      {showTagline && (
        <p
          className={
            taglineClassName ??
            "text-sm text-[var(--muted)] mt-1 hidden sm:block"
          }
        >
          See what delivery apps add to the menu
        </p>
      )}
    </div>
  );
}

type LogoProps = {
  href?: string;
  size?: number;
  showTagline?: boolean;
  className?: string;
  mono?: boolean;
};

/** Full lockup: mark + MenuTruth wordmark (+ optional tagline). */
export function Logo({
  size = 36,
  showTagline = false,
  className,
  mono = false,
}: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`}>
      <LogoMark size={size} mono={mono} />
      <LogoWordmark showTagline={showTagline} mono={mono} />
    </span>
  );
}

export const BRAND = {
  navy: NAVY,
  green: GREEN,
  red: RED,
  cream: "#FAF9F6",
  tagline: "See what delivery apps add to the menu",
} as const;
