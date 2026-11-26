export type TreasurySpend = {
  index: number;
  amount: string;
  beneficiary: string;
  validFrom: number;
  expireAt: number;
  status: "pending" | "failed" | "attempted" | "unknown";
};

export function readSpend(index: number, value: unknown): TreasurySpend {
  const spend = value as { amount: { toString(): string }; beneficiary: { toString(): string }; validFrom: { toNumber(): number }; expireAt: { toNumber(): number }; status: { type: string } };
  const status = spend.status.type.toLowerCase();
  return {
    index, amount: spend.amount.toString(), beneficiary: spend.beneficiary.toString(),
    validFrom: spend.validFrom.toNumber(), expireAt: spend.expireAt.toNumber(),
    status: status === "pending" || status === "failed" || status === "attempted" ? status : "unknown",
  };
}

export function canClaim(spend: TreasurySpend, block: number) {
  return (spend.status === "pending" || spend.status === "failed") && block >= spend.validFrom && block < spend.expireAt;
}
