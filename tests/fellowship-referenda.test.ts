import assert from "node:assert/strict";
import test from "node:test";
import { BN } from "@polkadot/util";
import { parseReferendumInfo } from "../lib/chain/referenda";
import {
  parseFellowshipMemberRank,
  parseFellowshipVote,
} from "../lib/chain/fellowship-voting";

const number = (value: number) => ({
  toNumber: () => value,
  toBn: () => new BN(value),
});

test("parses Fellowship bareAyes without token support", () => {
  const parsed = parseReferendumInfo(71, {
    isNone: false,
    unwrapOr: () => null,
    unwrap: () => ({
      isOngoing: true,
      asOngoing: {
        track: number(3),
        submitted: number(35_935_185),
        submissionDeposit: { who: { toString: () => "member" } },
        proposal: {
          isLookup: true,
          asLookup: {
            hash_: { toHex: () => `0x${"11".repeat(32)}` },
            len: number(34),
          },
        },
        decisionDeposit: { isSome: false },
        tally: {
          bareAyes: number(4),
          ayes: number(19),
          nays: number(0),
        },
        deciding: { isSome: false },
        inQueue: { isTrue: false },
      },
    }),
  });

  assert.equal(parsed?.trackId, 3);
  assert.equal(parsed?.phase, "preparing");
  assert.equal(parsed?.tally?.ayes.toString(), "19");
  assert.equal(parsed?.tally?.nays.toString(), "0");
  assert.equal(parsed?.tally?.support.toString(), "4");
});

test("parses a Fellowship member rank and weighted vote", () => {
  assert.equal(
    parseFellowshipMemberRank({
      isNone: false,
      unwrap: () => ({ rank: number(6) }),
    }),
    6,
  );
  assert.deepEqual(
    parseFellowshipVote({
      isNone: false,
      unwrap: () => ({ isAye: true, isNay: false, asAye: number(10) }),
    }),
    { aye: true, weight: 10 },
  );
});

test("handles non-members, absent votes and Nay votes", () => {
  const none = { isNone: true, unwrap: () => null };
  assert.equal(parseFellowshipMemberRank(none), null);
  assert.equal(parseFellowshipVote(none), null);
  assert.deepEqual(
    parseFellowshipVote({
      isNone: false,
      unwrap: () => ({ isAye: false, isNay: true, asNay: number(3) }),
    }),
    { aye: false, weight: 3 },
  );
});
