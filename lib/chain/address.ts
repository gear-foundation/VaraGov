import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";

import { SS58_PREFIX } from "./format";

/** Compare Substrate accounts by public key, regardless of their SS58 prefix. */
export function sameAccount(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false;

  try {
    return (
      encodeAddress(decodeAddress(left), SS58_PREFIX) ===
      encodeAddress(decodeAddress(right), SS58_PREFIX)
    );
  } catch {
    return false;
  }
}
