export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 92 40"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Binly"
    >
      {/* tiny clay bin mark */}
      <g transform="translate(2,4)">
        <rect x="2" y="6" width="22" height="26" rx="3" fill="currentColor" />
        <rect x="0" y="3" width="26" height="5" rx="2" fill="currentColor" />
        <circle cx="6" cy="33" r="3" fill="currentColor" />
        <circle cx="20" cy="33" r="3" fill="currentColor" />
        <line x1="9" y1="13" x2="9" y2="27" stroke="hsl(var(--background))" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="13" y1="13" x2="13" y2="27" stroke="hsl(var(--background))" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="17" y1="13" x2="17" y2="27" stroke="hsl(var(--background))" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <text
        x="36"
        y="27"
        fontFamily="Fraunces, Georgia, serif"
        fontWeight="700"
        fontSize="20"
        fill="currentColor"
        letterSpacing="-0.02em"
      >
        Binly
      </text>
    </svg>
  );
}
