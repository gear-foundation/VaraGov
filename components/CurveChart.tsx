"use client";

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { curveThreshold } from "@/lib/chain/curves";
import { blocksToElapsedTime } from "@/lib/chain/format";
import type { TrackInfo } from "@/lib/chain/tracks";
import type { ReferendumOutlook } from "@/lib/chain/referendum-outlook";

export function CurveChart({
  track,
  outlook,
  approval, // current, 0..1 or null
  support,
}: {
  track: TrackInfo;
  outlook: ReferendumOutlook;
  approval: number | null;
  support: number | null;
}) {
  const position = (block: number | null) =>
    block !== null && outlook.decidingSince !== null && track.decisionPeriod > 0
      ? Math.max(0, block - outlook.decidingSince) / track.decisionPeriod * 100
      : null;
  const now = position(outlook.atBlock);
  const forecastEnd = position(outlook.forecastEndBlock);
  // A confirmation that starts before the deadline may finish after it.
  const domainEnd = Math.max(100, now ?? 0, forecastEnd ?? 0);
  const approvalExpected = outlook.forecastOutcome === "approved";
  const forecastColor = approvalExpected ? "var(--aye)" : "var(--nay)";
  const formatRate = (value: number) => `${(value * 100).toLocaleString("en-US", { maximumSignificantDigits: 4 })}%`;
  const data = Array.from({ length: 101 }, (_, i) => {
    const position = domainEnd * i / 100;
    const progress = Math.min(position / 100, 1);
    return {
      x: position,
      approval: curveThreshold(track.minApproval, progress) * 100,
      support: curveThreshold(track.minSupport, progress) * 100,
    };
  });
  const elapsedTime = (position: number) => blocksToElapsedTime(Math.round(track.decisionPeriod * position / 100));

  return (
    <div className="w-full text-xs">
      <ResponsiveContainer height={224}>
        <LineChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, domainEnd]}
            tickFormatter={elapsedTime}
            stroke="var(--muted)"
            tickLine={false}
            ticks={[0, domainEnd / 4, domainEnd / 2, domainEnd * 3 / 4, domainEnd]}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke="var(--muted)"
            tickLine={false}
          />
          <Tooltip
            cursor={false}
            formatter={(value) => `${Number(value).toFixed(1)}%`}
            labelFormatter={(label) => `${elapsedTime(Number(label))} since decision started`}
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
          {now !== null && (
            <ReferenceLine
              x={now}
              stroke="var(--ink)"
              strokeDasharray="4 4"
              label={{ value: "now", position: now > domainEnd * 0.7 ? "insideTopRight" : "insideTopLeft", fill: "var(--ink)", fontSize: 11 }}
            />
          )}
          {forecastEnd !== null && (
            <ReferenceLine
              x={forecastEnd}
              stroke={forecastColor}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              label={{
                value: approvalExpected ? "approval" : "rejection",
                position: forecastEnd > domainEnd * 0.5 ? "insideBottomRight" : "insideBottomLeft",
                fill: forecastColor,
                fontSize: 11,
              }}
            />
          )}
          {approval !== null && (
            <ReferenceLine
              y={approval * 100}
              stroke="var(--aye)"
              strokeWidth={1.5}
              strokeDasharray="2 4"
              zIndex={600}
            />
          )}
          {support !== null && (
            <ReferenceLine
              y={support * 100}
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="2 4"
              strokeDashoffset={3}
              zIndex={600}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-[11px] text-muted">Time since decision started</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {approval !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-aye" aria-hidden="true" />
            Current approval {formatRate(approval)}
          </span>
        )}
        {support !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-accent" aria-hidden="true" />
            Current support {formatRate(support)}
          </span>
        )}
      </div>
      {forecastEnd !== null && (
        <div className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed">
          <p className={approvalExpected ? "text-aye" : "text-nay"}>
            Projected {approvalExpected ? "approval" : "rejection"} at {elapsedTime(forecastEnd)}
          </p>
          <p className="mt-1 text-muted">
            Assumes unchanged votes and active issuance.
            {approvalExpected ? " Includes the confirmation period." : " More votes are needed to pass."}
          </p>
        </div>
      )}
    </div>
  );
}
