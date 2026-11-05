import { BN } from "@polkadot/util";
import { curveThresholdParts, fractionParts } from "./curves";
import { ONGOING_PHASES, type Referendum } from "./referenda";
import type { TrackInfo } from "./tracks";

export type ReferendumOutlook = {
  state: "waiting" | "loading" | "unavailable" | "below" | "passing" | "confirming" | "finished";
  approval: number | null;
  support: number | null;
  approvalThreshold: number | null;
  supportThreshold: number | null;
  approvalMet: boolean | null;
  supportMet: boolean | null;
  progress: number;
  atBlock: number | null;
  confirmationBlock: number | null;
  approvalBlock: number | null;
};

// Every input for an ongoing referendum belongs to the same finalized snapshot.
export function referendumOutlook(
  referendum: Referendum,
  track?: TrackInfo,
  activeIssuance?: BN,
  atBlock?: number,
): ReferendumOutlook {
  track ??= referendum.snapshot?.track;
  activeIssuance ??= referendum.snapshot?.activeIssuance;
  atBlock ??= referendum.snapshot?.atBlock;
  const result: ReferendumOutlook = {
    state: "loading", approval: null, support: null,
    approvalThreshold: null, supportThreshold: null,
    approvalMet: null, supportMet: null, progress: 0,
    atBlock: atBlock ?? null, confirmationBlock: null, approvalBlock: null,
  };
  if (!ONGOING_PHASES.includes(referendum.phase)) return { ...result, state: "finished" };
  if (referendum.decidingSince === null) return { ...result, state: "waiting" };
  if (!track || !referendum.tally || !activeIssuance || atBlock === undefined) return result;
  if (activeIssuance.lten(0) || track.decisionPeriod <= 0) return { ...result, state: "unavailable" };

  const { ayes, nays, support } = referendum.tally;
  const approvalParts = fractionParts(ayes, ayes.add(nays));
  const supportParts = fractionParts(support, activeIssuance);
  const since = referendum.decidingSince;
  const elapsed = Math.max(0, atBlock - since);
  const progressParts = (offset: number) => fractionParts(new BN(Math.min(offset, track.decisionPeriod)), new BN(track.decisionPeriod));
  const passingAt = (offset: number) =>
    approvalParts >= curveThresholdParts(track.minApproval, progressParts(offset)) &&
    supportParts >= curveThresholdParts(track.minSupport, progressParts(offset));
  result.progress = Math.min(elapsed / track.decisionPeriod, 1);
  result.approval = approvalParts / 1e9;
  result.support = supportParts / 1e9;
  const approvalThresholdParts = curveThresholdParts(track.minApproval, progressParts(elapsed));
  const supportThresholdParts = curveThresholdParts(track.minSupport, progressParts(elapsed));
  result.approvalThreshold = approvalThresholdParts / 1e9;
  result.supportThreshold = supportThresholdParts / 1e9;
  result.approvalMet = approvalParts >= approvalThresholdParts;
  result.supportMet = supportParts >= supportThresholdParts;
  const passing = passingAt(elapsed);
  result.state = passing
    ? referendum.confirmingUntil !== null ? "confirming" : "passing"
    : "below";

  if (passing) {
    result.confirmationBlock = atBlock;
    // Confirmation may finish beyond decisionPeriod if it began while passing.
    result.approvalBlock = referendum.confirmingUntil ?? atBlock + track.confirmPeriod;
  } else if (elapsed < track.decisionPeriod && passingAt(track.decisionPeriod)) {
    let low = elapsed + 1;
    let high = track.decisionPeriod;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (passingAt(middle)) high = middle;
      else low = middle + 1;
    }
    result.confirmationBlock = since + low;
    result.approvalBlock = since + low + track.confirmPeriod;
  }
  return result;
}
