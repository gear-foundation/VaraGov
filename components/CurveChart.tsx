"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { curveThreshold } from "@/lib/chain/curves";
import type { TrackInfo } from "@/lib/chain/tracks";

export function CurveChart({
  track,
  progress, // 0..1 of decision period
  approval, // current, 0..1 or null
  support,
}: {
  track: TrackInfo;
  progress: number;
  approval: number | null;
  support: number | null;
}) {
  const data = Array.from({ length: 101 }, (_, i) => {
    const x = i / 100;
    return {
      x: i,
      approval: curveThreshold(track.minApproval, x) * 100,
      support: curveThreshold(track.minSupport, x) * 100,
    };
  });

  return (
    <div className="h-56 w-full text-xs">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            tickFormatter={(v) => `${v}%`}
            stroke="var(--muted)"
            tickLine={false}
            ticks={[0, 25, 50, 75, 100]}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke="var(--muted)"
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => `${Number(value).toFixed(1)}%`}
            labelFormatter={(l) => `${l}% of decision period`}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              color: "var(--ink)",
            }}
          />
          <Line
            dataKey="approval"
            name="Approval threshold"
            stroke="var(--aye)"
            dot={false}
            strokeWidth={1.5}
          />
          <Line
            dataKey="support"
            name="Support threshold"
            stroke="var(--accent)"
            dot={false}
            strokeWidth={1.5}
          />
          {progress > 0 && (
            <ReferenceLine
              x={Math.round(progress * 100)}
              stroke="var(--muted)"
              strokeDasharray="4 4"
              label={{ value: "now", fill: "var(--muted)", fontSize: 11 }}
            />
          )}
          {approval !== null && (
            <ReferenceLine
              y={approval * 100}
              stroke="var(--aye)"
              strokeDasharray="2 4"
              opacity={0.7}
            />
          )}
          {support !== null && (
            <ReferenceLine
              y={support * 100}
              stroke="var(--accent)"
              strokeDasharray="2 4"
              opacity={0.7}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
