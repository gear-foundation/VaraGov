// A small wax seal — the chamber's mark of a completed signature.
// Irregular wax blob, pressed ring, the V imprint. Pops in once.
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
      <path
        d="M24 3.5
           C30 2.5 36.5 5 40.5 9.5 C44.5 14 45.5 19 44.5 24.5
           C43.8 30.5 45 35 41 39.5 C37 44 30.5 45.5 24.5 44.5
           C18.5 45.8 13 43.5 9 39.5 C5 35.5 3 30 3.8 24
           C3 18.5 5.5 12.5 9.5 8.8 C13.5 5 18 4.3 24 3.5 Z"
        fill="oklch(0.46 0.145 27)"
      />
      <path
        d="M24 6.5 C34 5.5 42 12 41.5 24 C41 35 35 42 24 41.5 C13.5 42 6.8 35 6.5 24.5 C6.2 13.5 14 6.8 24 6.5 Z"
        fill="oklch(0.52 0.155 27)"
      />
      <circle
        cx="24"
        cy="24"
        r="13.5"
        stroke="oklch(0.38 0.13 27)"
        strokeWidth="1.4"
      />
      <path
        d="M18.5 18.5 L24 30 L29.5 18.5"
        stroke="oklch(0.36 0.12 27)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
