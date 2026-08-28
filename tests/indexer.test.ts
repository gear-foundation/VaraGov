import assert from "node:assert/strict";
import test from "node:test";
import { parseSnapshotVote, tallyFromEvent } from "../lib/server/indexer-parsers";

const amount = (value: string) => ({ toString: () => value });

test("parses all supported account vote variants", () => {
  assert.deepEqual(
    parseSnapshotVote({
      isStandard: true,
      asStandard: {
        balance: amount("100"),
        vote: { isAye: true, conviction: { index: 3 } },
      },
    }),
    {
      kind: "standard",
      aye: "100",
      nay: null,
      abstain: null,
      conviction: 3,
    },
  );
  assert.deepEqual(
    parseSnapshotVote({
      isStandard: false,
      isSplit: true,
      asSplit: { aye: amount("7"), nay: amount("5") },
    }),
    { kind: "split", aye: "7", nay: "5", abstain: null, conviction: null },
  );
  assert.deepEqual(
    parseSnapshotVote({
      isStandard: false,
      isSplit: false,
      isSplitAbstain: true,
      asSplitAbstain: {
        aye: amount("2"),
        nay: amount("3"),
        abstain: amount("11"),
      },
    }),
    { kind: "splitAbstain", aye: "2", nay: "3", abstain: "11", conviction: null },
  );
  assert.equal(parseSnapshotVote({}), null);
});

test("extracts terminal tally fields as lossless decimal strings", () => {
  assert.deepEqual(
    tallyFromEvent([
      amount("9"),
      { ayes: amount("1000000000001"), nays: amount("2"), support: amount("3") },
    ]),
    { ayes: "1000000000001", nays: "2", support: "3" },
  );
  assert.equal(tallyFromEvent([amount("9")]), null);
});
