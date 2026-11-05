import assert from "node:assert/strict";
import test from "node:test";
import { BN } from "@polkadot/util";
import { curveThresholdParts } from "../lib/chain/curves";
import { referendumOutlook } from "../lib/chain/referendum-outlook";
import type { Referendum } from "../lib/chain/referenda";
import type { TrackInfo } from "../lib/chain/tracks";

const linear = (ceil: number, floor: number) => ({ kind: "linearDecreasing" as const, ceil, floor, length: 1e9 });
const track: TrackInfo = {
  id: 1, name: "test", displayName: "Test", maxDeciding: 1, decisionDeposit: new BN(0),
  preparePeriod: 10, decisionPeriod: 1000, confirmPeriod: 100, minEnactmentPeriod: 10,
  minApproval: linear(1e9, 5e8), minSupport: linear(1e7, 0),
};
function ref(patch: Partial<Referendum> = {}): Referendum {
  return {
    index: 93, phase: "deciding", trackId: 1, proposer: "author", proposalHash: null,
    proposalLen: null, inlineHex: null, submittedAt: 1, decidingSince: 100,
    confirmingUntil: null, decidedAt: null, decisionDepositWho: "author",
    tally: { ayes: new BN(10_300_000), nays: new BN(0), support: new BN(10_000_000) },
    snapshot: { atBlock: 350, activeIssuance: new BN(10_000_000_000), track },
    ...patch,
  };
}

test("100% approval with 0.10% support is below 0.75%, with a future conditional forecast", () => {
  const outlook = referendumOutlook(ref());
  assert.equal(outlook.state, "below");
  assert.equal(outlook.approval, 1);
  assert.equal(outlook.support, 0.001);
  assert.equal(outlook.supportThreshold, 0.0075);
  assert.equal(outlook.approvalMet, true);
  assert.equal(outlook.supportMet, false);
  assert.equal(outlook.confirmationBlock, 1000);
  assert.equal(outlook.approvalBlock, 1100);
});

test("forecast waits until both approval and support meet their thresholds", () => {
  const referendum = ref({ tally: { ayes: new BN(55), nays: new BN(45), support: new BN(10_000_000) } });
  const outlook = referendumOutlook(referendum);
  assert.equal(outlook.approvalMet, false);
  assert.equal(outlook.confirmationBlock, 1000);
  const previous = referendumOutlook(referendum, track, new BN(10_000_000_000), 999);
  assert.equal(previous.state, "below");
  assert.equal(referendumOutlook(referendum, track, new BN(10_000_000_000), 1000).state, "passing");
});

test("no votes or unreachable approval cannot produce a successful forecast", () => {
  for (const [ayes, nays] of [[0, 0], [49, 51]]) {
    const outlook = referendumOutlook(ref({ tally: { ayes: new BN(ayes), nays: new BN(nays), support: new BN(0) } }));
    assert.equal(outlook.state, "below");
    assert.equal(outlook.approvalBlock, null);
  }
});

test("loading, preparation, a zero electorate and terminal states are distinct", () => {
  assert.equal(referendumOutlook(ref({ snapshot: undefined })).state, "loading");
  assert.equal(referendumOutlook(ref({ phase: "preparing", decidingSince: null })).state, "waiting");
  assert.equal(referendumOutlook(ref({ phase: "queueing", decidingSince: null })).state, "waiting");
  assert.equal(referendumOutlook(ref(), track, new BN(0), 350).state, "unavailable");
  assert.equal(referendumOutlook(ref({ phase: "approved", tally: null })).state, "finished");
});

test("uses the chain confirmation deadline, even beyond the decision period", () => {
  const referendum = ref({ phase: "confirming", confirmingUntil: 1180 });
  const outlook = referendumOutlook(referendum, track, new BN(10_000_000_000), 1090);
  assert.equal(outlook.state, "confirming");
  assert.equal(outlook.approvalBlock, 1180);
  const interrupted = referendumOutlook({ ...referendum, tally: { ayes: new BN(1), nays: new BN(100), support: new BN(0) } });
  assert.equal(interrupted.state, "below");
  assert.equal(interrupted.approvalBlock, null);
});

test("passing at the end may still complete its confirmation period afterwards", () => {
  const outlook = referendumOutlook(ref(), track, new BN(10_000_000_000), 1100);
  assert.equal(outlook.state, "passing");
  assert.equal(outlook.approvalBlock, 1200);
});

test("Perbill comparisons use unrounded integer parts at the boundary", () => {
  const boundary = { ...track, minApproval: linear(500_000_001, 500_000_001), minSupport: linear(0, 0) };
  const referendum = ref({ tally: { ayes: new BN(500_000_000), nays: new BN(500_000_000), support: new BN(0) } });
  assert.equal(referendumOutlook(referendum, boundary).state, "below");
  assert.equal(referendumOutlook({ ...referendum, tally: { ...referendum.tally!, ayes: new BN(500_000_002), nays: new BN(499_999_998) } }, boundary).state, "passing");
  assert.equal(curveThresholdParts({ kind: "linearDecreasing", length: 700_000_000, ceil: 900_000_000, floor: 500_000_000 }, 1), 900_000_000);
});
