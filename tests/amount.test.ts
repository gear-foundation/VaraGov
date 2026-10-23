import assert from "node:assert/strict";
import test from "node:test";

import { parseVaraAmount } from "../lib/chain/amount";

test("parses the smallest exact VARA amount", () => {
  const result = parseVaraAmount("0.000000000001");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.planck.toString(), "1");
});

test("rejects amounts below one planck instead of rounding them to zero", () => {
  const result = parseVaraAmount("0.0000000000001");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /12 decimal places/);
});

test("rejects excess precision instead of silently truncating it", () => {
  const result = parseVaraAmount("1.0000000000001");
  assert.equal(result.ok, false);
});

test("rejects zero, exponent notation and malformed amounts", () => {
  for (const value of ["0", "-1", "1e3", "1.2.3", "VARA"]) {
    assert.equal(parseVaraAmount(value).ok, false, value);
  }
});
