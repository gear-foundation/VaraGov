"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
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
import { BLOCK_TIME_MS, blocksToElapsedTime } from "@/lib/chain/format";
import { curveWindow, type CurveView } from "@/lib/chain/curve-window";
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
  const [view, setView] = useState<CurveView>("auto");
  const position = (block: number | null) =>
    block !== null && outlook.decidingSince !== null && track.decisionPeriod > 0
      ? Math.max(0, block - outlook.decidingSince)
      : null;
  const now = position(outlook.atBlock);
  const forecastEnd = position(outlook.forecastEndBlock);
  const timeWindow = curveWindow(track.decisionPeriod, now, forecastEnd, view);
  const span = timeWindow.end - timeWindow.start;
  const fraction = (value: number) => (value - timeWindow.start) / span;
  const approvalExpected = outlook.forecastOutcome === "approved";
  const forecastColor = approvalExpected ? "var(--aye)" : "var(--nay)";
  const formatRate = (value: number) => `${(value * 100).toLocaleString("en-US", { maximumSignificantDigits: 4 })}%`;
  const data = Array.from({ length: 101 }, (_, i) => {
    const position = timeWindow.start + span * i / 100;
    const progress = track.decisionPeriod > 0 ? Math.min(position / track.decisionPeriod, 1) : 0;
    return {
      x: position,
      approval: curveThreshold(track.minApproval, progress) * 100,
      support: curveThreshold(track.minSupport, progress) * 100,
    };
  });
  const elapsedTime = (position: number) => {
    const blocks = Math.round(position);
    const time = blocksToElapsedTime(blocks);
    const seconds = Math.floor(blocks * BLOCK_TIME_MS / 1000) % 60;
    return timeWindow.showSeconds ? `${time} ${String(seconds).padStart(2, "0")}s` : time;
  };
  const remaining = now !== null && forecastEnd !== null ? Math.max(0, forecastEnd - now) : null;
  const remainingLabel = remaining === null ? null
    : remaining <= 0 ? "Awaiting chain decision"
    : remaining * BLOCK_TIME_MS < 60_000 ? "in <1 min"
    : `in ${blocksToElapsedTime(remaining)}`;

  return (
    <div className="w-full text-xs">
      {timeWindow.canFocus && (
        <div role="group" aria-label="Chart time window" className="mb-3 flex w-fit rounded-[3px] border border-line bg-surface-2 p-0.5">
          {(["focus", "full"] as const).map((mode) => {
            const active = mode === "focus" ? timeWindow.focused : !timeWindow.focused;
            return (
              <button key={mode} type="button" aria-pressed={active}
                title={mode === "focus" ? "Zoom to now and the projected end" : "Show the complete decision period"}
                onClick={() => setView(mode)}
                className={`rounded-[2px] px-2.5 py-1 text-[11px] transition-colors ${active ? "bg-surface font-medium text-accent-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                {mode === "focus" ? "Near now" : "Full period"}
              </button>
            );
          })}
        </div>
      )}
      <ResponsiveContainer height={224}>
        <LineChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="x"
            type="number"
            domain={[timeWindow.start, timeWindow.end]}
            tickFormatter={elapsedTime}
            stroke="var(--muted)"
            tickLine={false}
            ticks={Array.from({ length: 5 }, (_, i) => timeWindow.start + span * i / 4)}
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
              label={{
                value: "now", position: fraction(now) > 0.15 ? "insideTopRight" : "insideTopLeft",
                fill: "var(--ink)", fontSize: 11,
                stroke: "var(--surface)", strokeWidth: 4, paintOrder: "stroke",
              }}
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
                position: fraction(forecastEnd) > 0.75 ? "insideBottomRight" : "insideBottomLeft",
                fill: forecastColor,
                fontSize: 11,
                stroke: "var(--surface)", strokeWidth: 4, paintOrder: "stroke",
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
      <p className="mt-1 text-center text-[11px] text-muted">
        {timeWindow.focused ? "Focused interval · time since decision started" : "Time since decision started"}
      </p>
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
        <div className="mt-3 rounded-[3px] border border-line bg-surface-2 p-3 text-[11px] leading-relaxed">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className={approvalExpected ? "font-medium text-aye" : "font-medium text-nay"}>
              Projected {approvalExpected ? "approval" : "rejection"}
            </p>
            {remainingLabel && <p className="tnum text-muted">{remainingLabel}</p>}
          </div>
          {now !== null && (
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-line pt-2">
              <div>
                <p className="text-muted">Now</p>
                <p className="tnum font-medium text-ink">{elapsedTime(now)}</p>
              </div>
              <ArrowRight size={14} className="text-muted" aria-hidden="true" />
              <div className="text-right">
                <p className="text-muted">{approvalExpected ? "Approval" : "Rejection"}</p>
                <p className={`tnum font-medium ${approvalExpected ? "text-aye" : "text-nay"}`}>{elapsedTime(forecastEnd)}</p>
              </div>
            </div>
          )}
          <p className="mt-2 text-muted">
            Assumes unchanged votes and active issuance.
            {approvalExpected ? " Includes the confirmation period." : " More votes are needed to pass."}
          </p>
        </div>
      )}
    </div>
  );
}
