import { encodeAddress } from "@polkadot/util-crypto";
import { BN } from "@polkadot/util";
import BigNumber from "bignumber.js";
import type { ApiPromise } from "@polkadot/api";
import { curveThresholdParts } from "./curves";
import type { TrackInfo } from "./tracks";
import { DECIMALS, SS58_PREFIX } from "./format";
import type { DecodedCallNode } from "./call-decoder";
import { isDecodedCallNode, type DecodedCallValue } from "./call-decoder";

export const TREASURY_ADDRESS = encodeAddress(
  "0x6d6f646c70792f7472737279".padEnd(66, "0"), SS58_PREFIX,
);

export function poolBondedAccount(palletId: string, encodedPoolId: string) {
  return ("0x6d6f646c" + palletId.slice(2) + "00" + encodedPoolId.slice(2)).padEnd(66, "0");
}

export const SPEND_TRACK_NAMES = ["small_tipper", "big_tipper", "small_spender", "medium_spender", "big_spender", "treasurer"];

// SpendOrigin caps are runtime code in Vara. Supply the reviewed table for the
// exact deployed specVersion when the runtime does not expose a limit constant.
export function spendLimits(version: number, configured: unknown): Record<string, string> | null {
  if (!configured || typeof configured !== "object") return null;
  const config = configured as { specVersion?: unknown; limits?: Record<string, unknown> };
  if (config.specVersion !== version || !config.limits) return null;
  const entries = SPEND_TRACK_NAMES.map((name) => [name, config.limits?.[name]] as const);
  if (entries.some(([, cap]) => typeof cap !== "string" || !/^[1-9]\d{0,25}$/.test(cap))) return null;
  return Object.fromEntries(entries.map(([name, cap]) => [name, new BigNumber(cap as string).shiftedBy(DECIMALS).toFixed()]));
}

export function selectSpendTrack(tracks: TrackInfo[], limits: Record<string, string>, amount: BN) {
  return SPEND_TRACK_NAMES.map((name) => tracks.find((track) => track.name === name))
    .find((track) => track && limits[track.name] && amount.lte(new BN(limits[track.name])));
}

export function requiredSupport(track: TrackInfo, issuance: BN, progress = 1) {
  const parts = BigInt(curveThresholdParts(track.minSupport, Math.floor(progress * 1e9)));
  return ((BigInt(issuance.toString()) * parts + BigInt(999_999_999)) / BigInt(1_000_000_000)).toString();
}

export function nativeSpend(api: ApiPromise, amount: BN, beneficiary: string) {
  const spend = api.tx.treasury?.spend;
  if (!spend || spend.meta.args.length !== 4 || spend.meta.args[0].type.toString() !== "Null") throw new Error("Unsupported treasury runtime");
  return spend(new Uint8Array(), amount, beneficiary, null);
}

export type ProposedSpend = { amount: string; beneficiary: string; legacy: boolean; validFrom: number | null };

export function proposalSummary(root: DecodedCallNode | null | undefined, track?: string) {
  const spends: ProposedSpend[] = [];
  let complex = track === "root" || track === "whitelisted_caller";
  let incomplete = !root;
  let blockedTreasuryCall = false;
  function visit(value: DecodedCallValue) {
    if (isDecodedCallNode(value)) {
      const { section, method, args } = value;
      if (section === "unknown" || (section === "whitelist" && method === "dispatchWhitelistedCall" && !args.some((arg) => arg.name === "resolved call"))) incomplete = true;
      if (section === "utility" || section === "proxy" || section === "multisig" || section === "whitelist" || section === "scheduler") complex = true;
      if ((section === "treasury" && method === "spendLocal") || (section === "bounties" && method === "approveBounty")) blockedTreasuryCall = true;
      if (section === "treasury" && (method === "spend" || method === "spendLocal")) {
        const amount = args.find((arg) => arg.name === "amount")?.value;
        const recipient = args.find((arg) => arg.name === "beneficiary")?.value;
        const address = recipient && typeof recipient === "object" && !Array.isArray(recipient) && "id" in recipient ? recipient.id : recipient;
        const validFrom = args.find((arg) => arg.value != null && arg.name.replace(/_/g, "").toLowerCase() === "validfrom")?.value;
        if (validFrom != null) blockedTreasuryCall = true;
        const digits = typeof amount === "string" || (typeof amount === "number" && Number.isSafeInteger(amount)) ? String(amount) : "";
        if (/^(?:\d+|0x[0-9a-f]+)$/i.test(digits) && typeof address === "string") {
          try {
            spends.push({ amount: BigInt(digits).toString(), beneficiary: encodeAddress(address, SS58_PREFIX), legacy: method === "spendLocal", validFrom: validFrom == null ? null : Number(validFrom) });
          } catch { incomplete = true; }
        } else incomplete = true;
      }
      args.forEach((arg) => visit(arg.value));
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
    else if (value === "[truncated]") incomplete = true;
  }
  if (root) visit(root);
  const kind = spends.length ? track === "treasurer" ? "Infrastructure / treasury" : "Treasury spend"
    : root?.section === "system" && /^remark/.test(root.method) ? "Text proposal"
      : complex || root?.section === "system" ? "Network action" : root ? "Other proposal" : null;
  return { spends, complex, incomplete, kind, blockedTreasuryCall };
}
