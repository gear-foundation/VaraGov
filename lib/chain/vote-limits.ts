import { BN, BN_ZERO } from "@polkadot/util";

export const MAX_FEE_ERROR =
  "Max cannot be used because too little transferable VARA is available for the network fee. Top up the account, then try again.";

export type SafeMaximumVote =
  | { ok: true; balance: BN }
  | { ok: false; message: string };

export function safeMaximumVoteBalance(
  freeBalance: BN,
  frozenBalance: BN,
  existentialDeposit: BN,
  estimatedFee: BN,
): SafeMaximumVote {
  const protectedBalance = frozenBalance.gt(existentialDeposit)
    ? frozenBalance
    : existentialDeposit;
  const feeHeadroom = freeBalance.gt(protectedBalance)
    ? freeBalance.sub(protectedBalance)
    : BN_ZERO;

  if (estimatedFee.gt(feeHeadroom)) {
    return { ok: false, message: MAX_FEE_ERROR };
  }

  return { ok: true, balance: freeBalance.sub(estimatedFee) };
}
