import assert from "node:assert/strict";
import test from "node:test";

import { isTxPending, type TxStatus } from "../lib/chain/tx";

test("a transaction remains pending until it is finalized", () => {
  const states: TxStatus[] = [
    { state: "idle" },
    { state: "signing" },
    { state: "broadcast" },
    { state: "inBlock", blockHash: "0x01" },
    { state: "finalized", blockHash: "0x02" },
    { state: "error", message: "failed" },
  ];

  assert.deepEqual(states.map(isTxPending), [false, true, true, true, false, false]);
});
