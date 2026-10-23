import assert from "node:assert/strict";
import test from "node:test";
import { BN } from "@polkadot/util";

import {
  MAX_FEE_ERROR,
  safeMaximumVoteBalance,
} from "../lib/chain/vote-limits";

test("safe max reserves the estimated network fee", () => {
  const result = safeMaximumVoteBalance(
    new BN(18_020),
    new BN(0),
    new BN(10),
    new BN(20),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.balance.toString(), "18000");
});

test("safe max refuses to promise a usable amount when a lock consumes fee headroom", () => {
  const result = safeMaximumVoteBalance(
    new BN("18025040653650263"),
    new BN("18025000000000000"),
    new BN("1000000000000"),
    new BN("128536012900"),
  );
  assert.deepEqual(result, { ok: false, message: MAX_FEE_ERROR });
});

test("safe max preserves the existential deposit needed to pay a fee", () => {
  const result = safeMaximumVoteBalance(
    new BN(25),
    new BN(0),
    new BN(10),
    new BN(16),
  );
  assert.deepEqual(result, { ok: false, message: MAX_FEE_ERROR });
});
