// Engraved guilloche rosette — the security-print linework of ballots and
// banknotes. Pure SVG, generated deterministically; drifts imperceptibly.
function ringPath(base: number, amp: number, waves: number, phase: number): string {
  const pts: string[] = [];
  const N = 180;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r = base + amp * Math.sin(waves * t + phase);
    const x = 300 + r * Math.cos(t);
    const y = 300 + r * Math.sin(t);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join("") + "Z";
}

export function Guilloche({ className = "" }: { className?: string }) {
  const inner: string[] = [];
  const outer: string[] = [];
  for (let i = 0; i < 9; i++) {
    inner.push(ringPath(60 + i * 14, 8 + (i % 3) * 3, 9, i * 0.7));
  }
  for (let i = 0; i < 8; i++) {
    outer.push(ringPath(190 + i * 13, 10 + (i % 4) * 2, 12, i * 1.1));
  }
  return (
    <svg
      viewBox="0 0 600 600"
      fill="none"
      aria-hidden
      className={`guilloche ${className}`}
    >
      <g className="g-a">
        {inner.map((d, i) => (
          <path key={i} d={d} stroke="currentColor" strokeWidth="0.8" />
        ))}
      </g>
      <g className="g-b">
        {outer.map((d, i) => (
          <path key={i} d={d} stroke="currentColor" strokeWidth="0.7" />
        ))}
      </g>
      <circle cx="300" cy="300" r="52" stroke="currentColor" strokeWidth="1" />
      <circle cx="300" cy="300" r="48" stroke="currentColor" strokeWidth="0.6" />
    </svg>
  );
}
