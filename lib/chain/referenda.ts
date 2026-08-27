import type { ApiPromise } from "@polkadot/api";
import { BN } from "@polkadot/util";

export type Phase =
  | "preparing"
  | "queueing"
  | "deciding"
  | "confirming"
  | "approved"
  | "rejected"
  | "cancelled"
  | "timedOut"
  | "killed";

export const ONGOING_PHASES: Phase[] = [
  "preparing",
  "queueing",
  "deciding",
  "confirming",
];

export type Tally = { ayes: BN; nays: BN; support: BN };

export type Referendum = {
  index: number;
  phase: Phase;
  trackId: number | null; // null for terminal variants (track is dropped from state)
  proposer: string | null;
  proposalHash: string | null;
  proposalLen: number | null;
  inlineHex: string | null;
  submittedAt: number | null;
  decidingSince: number | null;
  confirmingUntil: number | null;
  decidedAt: number | null; // block of terminal event
  tally: Tally | null; // only while ongoing
  decisionDepositWho: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseReferendumInfo(index: number, info: any): Referendum | null {
  if (info.isNone !== undefined && info.isNone) return null;
  const v = info.unwrapOr ? info.unwrap() : info;

  const base: Referendum = {
    index,
    phase: "preparing",
    trackId: null,
    proposer: null,
    proposalHash: null,
    proposalLen: null,
    inlineHex: null,
    submittedAt: null,
    decidingSince: null,
    confirmingUntil: null,
    decidedAt: null,
    tally: null,
    decisionDepositWho: null,
  };

  if (v.isOngoing) {
    const o = v.asOngoing;
    base.trackId = o.track.toNumber();
    base.submittedAt = o.submitted.toNumber();
    base.proposer = o.submissionDeposit.who.toString();
    if (o.proposal.isLookup) {
      base.proposalHash = o.proposal.asLookup.hash_.toHex();
      base.proposalLen = o.proposal.asLookup.len.toNumber();
    } else if (o.proposal.isInline) {
      base.inlineHex = o.proposal.asInline.toHex();
    } else if (o.proposal.isLegacy) {
      base.proposalHash = o.proposal.asLegacy.hash_.toHex();
    }
    base.decisionDepositWho = o.decisionDeposit.isSome
      ? o.decisionDeposit.unwrap().who.toString()
      : null;
    base.tally = {
      ayes: o.tally.ayes.toBn(),
      nays: o.tally.nays.toBn(),
      support: o.tally.support.toBn(),
    };
    if (o.deciding.isSome) {
      const d = o.deciding.unwrap();
      base.decidingSince = d.since.toNumber();
      base.confirmingUntil = d.confirming.isSome
        ? d.confirming.unwrap().toNumber()
        : null;
      base.phase = base.confirmingUntil !== null ? "confirming" : "deciding";
    } else {
      base.phase = o.inQueue.isTrue ? "queueing" : "preparing";
    }
    return base;
  }

  // Terminal variants: (moment, submissionDeposit?, decisionDeposit?) or moment only (killed)
  const terminal: [string, Phase][] = [
    ["isApproved", "approved"],
    ["isRejected", "rejected"],
    ["isCancelled", "cancelled"],
    ["isTimedOut", "timedOut"],
    ["isKilled", "killed"],
  ];
  for (const [flag, phase] of terminal) {
    if (v[flag]) {
      base.phase = phase;
      const data = v[`as${phase[0].toUpperCase()}${phase.slice(1)}`];
      // Killed is a bare moment; the others are tuples [moment, deposits...]
      const moment = phase === "killed" ? data : data[0];
      base.decidedAt = moment.toNumber();
      if (phase !== "killed" && data[1] && data[1].isSome) {
        base.proposer = data[1].unwrap().who.toString();
      }
      return base;
    }
  }
  return base;
}

export async function fetchAllReferenda(api: ApiPromise): Promise<Referendum[]> {
  const entries = await api.query.referenda.referendumInfoFor.entries();
  const out: Referendum[] = [];
  for (const [key, info] of entries) {
    const index = (key.args[0] as any).toNumber();
    const parsed = parseReferendumInfo(index, info);
    if (parsed) out.push(parsed);
  }
  return out.sort((a, b) => b.index - a.index);
}

export type DecodedCall = {
  section: string;
  method: string;
  args: Record<string, string>;
  hex: string;
} | null;

export async function decodeProposal(
  api: ApiPromise,
  ref: Referendum,
): Promise<DecodedCall> {
  try {
    let hex = ref.inlineHex;
    if (!hex && ref.proposalHash && ref.proposalLen !== null) {
      const pre = await api.query.preimage.preimageFor([
        ref.proposalHash,
        ref.proposalLen,
      ]);
      if ((pre as any).isSome) hex = (pre as any).unwrap().toHex();
    }
    if (!hex) return null;
    const call = api.registry.createType("Call", hex);
    const args: Record<string, string> = {};
    call.meta.args.forEach((meta, i) => {
      args[meta.name.toString()] = call.args[i].toString();
    });
    return {
      section: call.section,
      method: call.method,
      args,
      hex,
    };
  } catch {
    return null;
  }
}
