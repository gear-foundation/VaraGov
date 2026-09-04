import type { ApiPromise } from "@polkadot/api";
import { BN } from "@polkadot/util";

export type CurveDef =
  | { kind: "linearDecreasing"; length: number; floor: number; ceil: number } // perbill
  | { kind: "reciprocal"; factor: BN; xOffset: BN; yOffset: BN };

export type TrackInfo = {
  id: number;
  name: string; // snake_case from chain
  displayName: string; // "Small Spender"
  maxDeciding: number;
  decisionDeposit: BN;
  preparePeriod: number;
  decisionPeriod: number;
  confirmPeriod: number;
  minEnactmentPeriod: number;
  minApproval: CurveDef;
  minSupport: CurveDef;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseCurve(c: any): CurveDef {
  if (c.isLinearDecreasing) {
    const l = c.asLinearDecreasing;
    return {
      kind: "linearDecreasing",
      length: l.length.toNumber(),
      floor: l.floor.toNumber(),
      ceil: l.ceil.toNumber(),
    };
  }
  const r = c.asReciprocal;
  return {
    kind: "reciprocal",
    factor: r.factor.toBn(),
    xOffset: r.xOffset.toBn(),
    yOffset: r.yOffset.toBn(),
  };
}

export function displayTrackName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseTracks(raw: any): TrackInfo[] {
  return raw.map((entry: any) => {
    // Both shapes exist across runtimes: tuple [id, info] and struct {id, info}
    const id = entry[0] ?? entry.id;
    const info = entry[1] ?? entry.info;
    const name = info.name.toString();
    return {
      id: id.toNumber(),
      name,
      displayName: displayTrackName(name),
      maxDeciding: info.maxDeciding.toNumber(),
      decisionDeposit: info.decisionDeposit.toBn(),
      preparePeriod: info.preparePeriod.toNumber(),
      decisionPeriod: info.decisionPeriod.toNumber(),
      confirmPeriod: info.confirmPeriod.toNumber(),
      minEnactmentPeriod: info.minEnactmentPeriod.toNumber(),
      minApproval: parseCurve(info.minApproval),
      minSupport: parseCurve(info.minSupport),
    };
  });
}

export function getTracks(api: ApiPromise): TrackInfo[] {
  return parseTracks(api.consts.referenda.tracks as any);
}

export function getFellowshipTracks(api: ApiPromise): TrackInfo[] {
  return parseTracks(api.consts.fellowshipReferenda.tracks as any);
}

// Origin for referenda.submit: root track uses system origin, others the Origins enum.
export function trackOrigin(track: TrackInfo): Record<string, unknown> {
  if (track.id === 0) return { system: "Root" };
  return { Origins: displayTrackName(track.name).replace(/ /g, "") };
}
