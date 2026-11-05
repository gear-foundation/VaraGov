"use client";

import type { ReferendumOutlook } from "@/lib/chain/referendum-outlook";
import { blocksToDuration } from "@/lib/chain/format";

const LABELS: Record<ReferendumOutlook["state"], string> = {
  waiting: "Decision not started",
  loading: "Loading voting requirements…",
  unavailable: "Voting requirements unavailable",
  below: "Below current thresholds",
  passing: "Current thresholds met",
  confirming: "Confirming",
  finished: "Voting complete",
};

export function VotingOutlook({ outlook, compact = false }: {
  outlook: ReferendumOutlook;
  compact?: boolean;
}) {
  if (outlook.state === "finished") return null;
  const tone = outlook.state === "passing" || outlook.state === "confirming"
    ? "text-aye" : outlook.state === "below" ? "text-warn" : "text-muted";
  const missing = [outlook.approvalMet === false && "approval", outlook.supportMet === false && "support"]
    .filter(Boolean).join(" and ");
  const remaining = (block: number) => blocksToDuration(Math.max(0, block - (outlook.atBlock ?? block)));
  return (
    <div className={compact ? "mt-2 text-xs" : "rounded-[3px] border border-line bg-surface-2 p-3 text-xs"}>
      <p className={`font-semibold ${tone}`}>{LABELS[outlook.state]}</p>
      {!compact && outlook.state === "waiting" && (
        <p className="mt-1 leading-relaxed text-muted">The decision period has not started. Voting is open; passing is assessed once deciding begins.</p>
      )}
      {!compact && outlook.state === "below" && (
        <p className="mt-1 leading-relaxed text-muted">Current {missing} {missing.includes(" and ") ? "are" : "is"} below the required threshold.</p>
      )}
      {!compact && outlook.state === "passing" && (
        <p className="mt-1 leading-relaxed text-muted">Both thresholds are met. The chain must confirm them continuously for the confirmation period.</p>
      )}
      {outlook.approvalBlock !== null && (
        <p className="tnum mt-1 leading-relaxed text-muted">
          {outlook.state === "confirming"
            ? `Confirmation ends in ~${remaining(outlook.approvalBlock)}`
            : compact
              ? `May be approved in ~${remaining(outlook.approvalBlock)}`
              : `Estimated approval in ~${remaining(outlook.approvalBlock)}`}
        </p>
      )}
      {!compact && outlook.state === "below" && outlook.confirmationBlock !== null && (
        <p className="tnum mt-1 leading-relaxed text-muted">Both thresholds may be met in ~{remaining(outlook.confirmationBlock)} as requirements decrease.</p>
      )}
      {outlook.state === "below" && outlook.approvalBlock === null && (
        <p className="mt-1 leading-relaxed text-muted">More votes are needed to meet the thresholds.</p>
      )}
      {!compact && outlook.approvalBlock !== null && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">Estimate assumes unchanged votes and active issuance. Approval is final only when confirmed on chain.</p>
      )}
      {compact && outlook.approvalBlock !== null && outlook.state !== "confirming" && (
        <p className="mt-0.5 text-[11px] text-muted">If votes and issuance stay unchanged</p>
      )}
    </div>
  );
}
