import assert from "node:assert/strict";
import test from "node:test";

import { encodeAddress } from "@polkadot/util-crypto";

import { sameAccount } from "../lib/chain/address";

const publicKey = new Uint8Array(32).fill(7);

test("sameAccount ignores the SS58 display prefix", () => {
  assert.equal(
    sameAccount(encodeAddress(publicKey, 0), encodeAddress(publicKey, 137)),
    true,
  );
});

test("sameAccount rejects different and malformed addresses", () => {
  assert.equal(
    sameAccount(
      encodeAddress(publicKey, 137),
      encodeAddress(new Uint8Array(32).fill(8), 137),
    ),
    false,
  );
  assert.equal(sameAccount("not-an-address", encodeAddress(publicKey, 137)), false);
  assert.equal(sameAccount(null, encodeAddress(publicKey, 137)), false);
});
