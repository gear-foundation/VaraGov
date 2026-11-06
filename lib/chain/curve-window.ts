import { BLOCK_TIME_MS } from "./format";

export type CurveView = "auto" | "full" | "focus";

// Domain values are elapsed blocks; zoom never changes either marker's time.
export function curveWindow(
  decisionPeriod: number,
  now: number | null,
  forecast: number | null,
  view: CurveView = "auto",
) {
  const fullEnd = Math.max(1, decisionPeriod, now ?? 0, forecast ?? 0);
  const canFocus = now !== null && forecast !== null && forecast > now;
  const full = { start: 0, end: fullEnd, canFocus, focused: false, showSeconds: false };
  if (now === null || forecast === null || forecast <= now || view === "full") return full;
  const gap = forecast - now;
  if (view === "auto" && gap / fullEnd >= 0.12) return full;
  const minimumSpan = 30_000 / BLOCK_TIME_MS;
  const padding = Math.max(gap, (minimumSpan - gap) / 2);
  const start = Math.max(0, now - padding);
  const end = Math.min(fullEnd, forecast + padding);
  return { start, end, canFocus, focused: true, showSeconds: (end - start) * BLOCK_TIME_MS < 120_000 };
}
