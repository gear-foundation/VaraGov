// Compact VaraGov mark. Its dimensions stay stable across the header and dialogs.
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="18" cy="18" r="16.5" stroke="var(--accent)" strokeWidth="1.6" />
      <circle
        cx="18"
        cy="18"
        r="13.4"
        stroke="var(--accent)"
        strokeWidth="0.7"
        opacity="0.75"
      />
      <path
        d="M11.4 11.5 L18 25.5 L24.6 11.5"
        stroke="var(--ink)"
        strokeWidth="3.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="8.6" r="1.5" fill="var(--accent)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="display text-[19px] font-bold">
        Vara<span className="text-accent-ink">Gov</span>
      </span>
    </span>
  );
}
