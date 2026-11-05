import assert from "node:assert/strict";
import test from "node:test";
import { resolveReferendumContext } from "../lib/server/referendum-context";

const number = (value: number) => ({ toNumber: () => value, toBn: () => value });
test("finished Fellowship authors are read from the archive before the terminal block", async () => {
  const calls: string[] = [];
  const none = { isSome: false };
  const current = { isNone: false, unwrapOr: () => null, unwrap: () => ({
    isApproved: true, asApproved: [number(500), none, none],
  }) };
  const historical = { isNone: false, unwrapOr: () => null, unwrap: () => ({ isOngoing: true, asOngoing: {
    track: number(3), submitted: number(100), submissionDeposit: { who: { toString: () => "verified proposer" } },
    proposal: {}, decisionDeposit: none, tally: { ayes: { toBn: () => 16 }, nays: { toBn: () => 0 }, bareAyes: { toBn: () => 3 } },
    deciding: none, inQueue: { isTrue: false },
  } }) };
  const sources = {
    getApi: async () => ({ query: { fellowshipReferenda: { referendumInfoFor: async () => current } } }),
    getArchiveApi: async () => ({ rpc: { chain: { getBlockHash: async (block: number) => { calls.push(`block:${block}`); return "parent"; } } },
      at: async (hash: string) => { calls.push(`at:${hash}`); return { query: { fellowshipReferenda: { referendumInfoFor: async () => historical } } }; },
    }),
  };
  const context = await resolveReferendumContext("fellowship", 75, sources as never);
  assert.equal(context?.phase, "approved");
  assert.equal(context?.proposer, "verified proposer");
  assert.equal(context?.trackId, 3);
  assert.deepEqual(calls, ["block:499", "at:parent"]);
});
