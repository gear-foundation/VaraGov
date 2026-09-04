import assert from "node:assert/strict";
import test from "node:test";
import { BN } from "@polkadot/util";
import { parseReferendumInfo } from "../lib/chain/referenda";

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
