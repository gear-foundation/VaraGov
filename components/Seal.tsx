// A compact Vara completion mark. Pops in once without changing layout.
export function Seal({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className="seal-in shrink-0"
    >
      <circle cx="24" cy="24" r="20" fill="var(--accent-soft)" />
      <circle
        cx="24"
        cy="24"
        r="19.25"
        stroke="var(--accent)"
        strokeWidth="1.4"
      />
      <path
        d="M18.5 18.5 L24 30 L29.5 18.5"
        stroke="var(--accent-ink)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
