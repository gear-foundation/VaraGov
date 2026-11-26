import { createKeyMulti, encodeAddress } from "@polkadot/util-crypto";
import type { ApiPromise } from "@polkadot/api";
import { getArchiveApi, getServerApi } from "./chain";
import { readChainClock } from "../chain/chain-clock";
import { getTracks } from "../chain/tracks";
import { poolBondedAccount, requiredSupport, spendLimits, TREASURY_ADDRESS } from "../chain/treasury";

import { sameAccount } from "../chain/address";
import { SS58_PREFIX } from "../chain/format";
import { readSpend } from "../chain/treasury-spend";

function configuredJson(value?: string): unknown {
  try { return JSON.parse(value ?? "null"); } catch { return null; }
}

function infrastructurePlan() {
  const value = configuredJson(process.env.VARA_TREASURY_INFRASTRUCTURE) as { usd?: unknown; due?: unknown } | null;
  return value && typeof value.usd === "number" && Number.isFinite(value.usd) && value.usd > 0 &&
    typeof value.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.due) ? { usd: value.usd, due: value.due } : null;
}

function multisigConfig() {
  const value = configuredJson(process.env.VARA_TREASURY_MULTISIG) as { threshold?: unknown; signers?: unknown; address?: unknown } | null;
  if (!value || typeof value.threshold !== "number" || !Number.isInteger(value.threshold) ||
      !Array.isArray(value.signers) || value.threshold < 2 || value.threshold > value.signers.length ||
      !value.signers.every((signer): signer is string => typeof signer === "string") || typeof value.address !== "string") return null;
  try {
    const signers = value.signers.map((signer) => encodeAddress(signer, SS58_PREFIX));
    if (new Set(signers).size !== signers.length) return null;
    const address = encodeAddress(createKeyMulti(signers, value.threshold), SS58_PREFIX);
    return sameAccount(address, value.address) ? { address, threshold: value.threshold, signers } : null;
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function readPool(at: Awaited<ReturnType<ApiPromise["at"]>>, api: ApiPromise, block: number, memberAddress: string) {
  const member: any = await at.query.nominationPools.poolMembers(memberAddress);
  if (member.isNone) return null;
  const { poolId, points, unbondingEras } = member.unwrap();
  const id = poolId.toNumber();
  // PalletId::into_sub_account_truncating((AccountType::Bonded, pool_id)).
  const bondedAccount = poolBondedAccount(at.consts.nominationPools.palletId.toHex(), api.registry.createType("u32", id).toHex());
  const [bonded, subPools, currentEra, activeEra, eraStart, balance, nominations, proxies, claimed, activeValidators, permission] = await Promise.all([
    at.query.nominationPools.bondedPools(id),
    at.query.nominationPools.subPoolsStorage(id),
    at.query.staking.currentEra(),
    at.query.staking.activeEra(),
    at.query.staking.erasStartSessionIndex.entries(),
    at.call.nominationPoolsApi.pointsToBalance(id, points),
    at.query.staking.nominators(bondedAccount),
    at.query.proxy.proxies(memberAddress),
    at.call.nominationPoolsApi.pendingRewards(memberAddress),
    at.query.session.validators(),
    at.query.nominationPools.claimPermissions(memberAddress),
  ]) as any[];
  const era = currentEra.unwrapOrDefault().toNumber();
  const eraStarts = eraStart.map(([key, value]: any) => [key.args[0].toNumber(), (value.unwrapOrDefault?.() ?? value).toNumber()] as const)
    .sort((a: number[], b: number[]) => b[0] - a[0]);
  const [start, previous] = eraStarts;
  const sessionLength = Number(at.consts.babe?.epochDuration?.toString());
  const blocksPerEra = start && previous ? (start[1] - previous[1]) * sessionLength / (start[0] - previous[0]) : null;
  const activeStart = activeEra.isSome && activeEra.unwrap().start.isSome
    ? Number(activeEra.unwrap().start.unwrap().toString()) : null;
  const activeIndex = activeEra.isSome ? activeEra.unwrap().index.toNumber() : null;
  const pools = subPools.isSome ? subPools.unwrap() : null;
  const unlocking = Array.from(unbondingEras as Iterable<[any, any]>, ([unlockEra, memberPoints]) => {
    const subPool = pools?.withEra.get(unlockEra) ?? pools?.noEra;
    const totalPoints = BigInt(subPool?.points.toString() ?? 0);
    return {
      era: unlockEra.toNumber(), ready: unlockEra.toNumber() <= era,
      amount: totalPoints > BigInt(0)
        ? (BigInt(memberPoints.toString()) * BigInt(subPool.balance.toString()) / totalPoints).toString()
        : null,
    };
  });
  const active = new Set(Array.from(activeValidators as Iterable<any>, (address) => address.toHex()));
  const targets = nominations.isSome ? Array.from(nominations.unwrap().targets as Iterable<any>) : [];
  const validators = await Promise.all(targets.map(async (address) => {
    const prefs: any = await at.query.staking.validators(address);
    return { address: address.toString(), active: active.has(address.toHex()), commission: Number(prefs.commission.toString()) / 1e7 };
  }));
  return {
    id, balance: balance.toString(), unlocking, era, activeIndex, activeStart,
    claimPermission: permission.type as string,
    blocksPerEra: blocksPerEra && Number.isFinite(blocksPerEra) ? blocksPerEra : null,
    atBlock: block,
    state: bonded.isSome ? bonded.unwrap().state.type as string : null,
    roles: bonded.isSome ? bonded.unwrap().roles.toHuman() as Record<string, string> : null,
    members: bonded.isSome ? bonded.unwrap().memberCounter.toNumber() as number : null,
    validators, proxies: proxies[0].toHuman() as Array<{ delegate: string; proxyType: string; delay: string }>,
    pendingRewards: claimed.toString(),
  };
}

export async function treasurySnapshot() {
  const api = await getServerApi();
  const hash = await api.rpc.chain.getFinalizedHead();
  const [at, header, version] = await Promise.all([api.at(hash), api.rpc.chain.getHeader(hash), api.rpc.state.getRuntimeVersion(hash)]);
  const block = header.number.toNumber();
  const [account, rows, total, inactive, clock, poolResult] = await Promise.all([
    at.query.system.account(TREASURY_ADDRESS),
    at.query.treasury.spends.entries(),
    at.query.balances.totalIssuance(),
    at.query.balances.inactiveIssuance(),
    readChainClock(api, hash.toHex(), block, getArchiveApi),
    readPool(at, api, block, TREASURY_ADDRESS).then((pool) => ({ pool, poolUnavailable: false }), () => ({ pool: null, poolUnavailable: true })),
  ]);
  const tracks = getTracks(at as unknown as ApiPromise);
  const issuance = total.toBn().sub(inactive.toBn());
  const specVersion = version.specVersion.toNumber();
  // Published Vara v2.1.1 runtime origins (specVersion 20101).
  const config = configuredJson(process.env.VARA_TREASURY_LIMITS);
  const baseline = { specVersion: 20101, limits: {
    small_tipper: "1000", big_tipper: "5000", small_spender: "50000",
    medium_spender: "500000", big_spender: "5000000", treasurer: "50000000",
  } };
  const limits = spendLimits(specVersion, config) ?? spendLimits(specVersion, baseline);
  const spends = rows.flatMap(([key, row]: any) => row.isSome ? [readSpend(key.args[0].toNumber(), row.unwrap())] : []);
  const { data, providers, consumers } = account as any;
  const free = BigInt(data.free.toString());
  const frozenFree = BigInt(data.frozen.toString()) - BigInt(data.reserved.toString());
  const existentialDeposit = BigInt(at.consts.balances.existentialDeposit.toString());
  const requiredToKeepProvider = consumers.toNumber() > 0 && providers.toNumber() <= 1 ? existentialDeposit : BigInt(0);
  const available = free - (frozenFree > requiredToKeepProvider ? frozenFree : requiredToKeepProvider);
  const payable = spends.filter((spend) => spend.expireAt > block && spend.status !== "attempted");
  const obligations = payable.reduce((sum, spend) => sum + BigInt(spend.amount), BigInt(0));
  const liquid = available > BigInt(0) ? available : BigInt(0);
  return {
    address: TREASURY_ADDRESS, clock, specVersion, limits, spends, free: liquid.toString(),
    obligations: obligations.toString(), remaining: (liquid - obligations).toString(),
    support: Object.fromEntries(tracks.map((track) => [track.name, requiredSupport(track, issuance)])),
    payoutPeriod: Number(at.consts.treasury.payoutPeriod.toString()),
    infrastructure: infrastructurePlan(),
    multisig: multisigConfig(),
    ...poolResult,
  };
}
export type TreasurySnapshot = Awaited<ReturnType<typeof treasurySnapshot>>;
