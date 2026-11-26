import type { Referendum } from "./referenda";
import type { TrackInfo } from "./tracks";
import type { ReferendumOutlook } from "./referendum-outlook";

export function enactmentBlock(ref: Referendum, track: TrackInfo | undefined, approved: number | null) {
  if (approved === null || !track || !ref.enactment) return null;
  const minimum = approved + Math.max(1, track.minEnactmentPeriod);
  return Math.max(minimum, ref.enactment.type === "at" ? ref.enactment.block : approved + ref.enactment.block);
}

export function nextReferendumStage(ref: Referendum, track: TrackInfo | undefined, outlook: ReferendumOutlook) {
  if (ref.confirmingUntil !== null) return { label: "Confirmation ends", block: ref.confirmingUntil };
  if (ref.phase === "deciding") return outlook.confirmationBlock !== null
    ? { label: "Thresholds may be confirmed from", block: outlook.confirmationBlock }
    : { label: "Scheduled decision deadline", block: ref.decidingSince !== null && track ? ref.decidingSince + track.decisionPeriod : null };
  if (ref.phase === "queueing") return { label: "Waiting for a track slot", block: null };
  if (ref.phase === "preparing") {
    if (ref.submittedAt === null || !track) return null;
    if (!ref.decisionDepositWho) return { label: "Deposit deadline", block: ref.undecidingTimeout ? ref.submittedAt + ref.undecidingTimeout : null };
    const earliest = ref.submittedAt + track.preparePeriod;
    return { label: "Earliest decision start", block: earliest > (outlook.atBlock ?? 0) ? earliest : null };
  }
  return null;
}
