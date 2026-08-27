"use client";

// Odometer for the live finalized block: each digit is a 0-9 column that
// rolls to its value — the chamber's clock, ticking every ~3 seconds.
const COLUMN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function BlockTicker({ value }: { value: number }) {
  const chars = value.toLocaleString("en-US").split("");
  return (
    <span className="odometer tnum" aria-label={`Block ${value.toLocaleString("en-US")}`}>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={chars.length - i} className="digit" aria-hidden>
            <span style={{ transform: `translateY(-${Number(ch)}em)` }}>
              {COLUMN.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`s${chars.length - i}`} aria-hidden>
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
