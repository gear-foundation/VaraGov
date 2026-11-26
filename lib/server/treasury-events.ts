import type { ApiPromise } from "@polkadot/api";
import { u8aConcat, stringToU8a } from "@polkadot/util";
import { blake2AsHex } from "@polkadot/util-crypto";
import { directVoteCapital, parseDirectVote } from "../chain/direct-votes";
import { sameAccount } from "../chain/address";
import { poolBondedAccount, TREASURY_ADDRESS } from "../chain/treasury";
import { prisma } from "./db";

export type TreasuryEventDto = {
  block: number; ordinal: number; timestamp: string; kind: string;
  refIndex: number | null; spendIndex: number | null; txHash: string | null;
  data: string[];
};

const OPERATIONS = new Set(["Bonded", "Unbonded", "Withdrawn", "PaidOut", "StateChanged", "RolesUpdated", "PoolSlashed", "UnbondingPoolSlashed"]);
const SPENDS = new Set(["AssetSpendApproved", "AssetSpendVoided", "Paid", "PaymentFailed", "SpendProcessed"]);
const FAILURES: Record<string, number> = {
  "utility.DispatchedAs": 0, "utility.BatchInterrupted": 1, "utility.ItemFailed": 0,
  "proxy.ProxyExecuted": 0, "multisig.MultisigExecuted": 4, "whitelist.WhitelistedCallDispatched": 1,
};

export function enactmentId(api: Pick<ApiPromise, "registry">, index: number) {
  return blake2AsHex(u8aConcat(stringToU8a("assembly"), Uint8Array.of(9 << 2), stringToU8a("enactment"), api.registry.createType("u32", index).toU8a()));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function recordTreasuryBlock(api: ApiPromise, at: any, hash: string, block: number, events: any[]) {
  const relevant = new Set(["scheduler", "treasury", "balances", "nominationPools", "convictionVoting", "staking", "proxy", "imOnline"]);
  const successful = new Set<number>();
  for (const { event, phase } of events) {
    if (phase.isApplyExtrinsic && event.section === "system" && event.method === "ExtrinsicSuccess") successful.add(phase.asApplyExtrinsic.toNumber());
  }
  if (successful.size < 2 && events.every(({ event }) => !relevant.has(event.section))) return;

  const taskEvents = events.filter(({ event }) => event.section === "scheduler" &&
    ["Dispatched", "CallUnavailable"].includes(event.method) && event.data[1]?.isSome);
  const refs = new Map<string, number>();
  if (taskEvents.length) {
    const approved = await prisma.referendum.findMany({
      where: { status: "approved", decidedAt: { lte: block } }, select: { index: true },
    });
    for (const { index } of approved) refs.set(enactmentId(api, index), index);
  }
  const byEvent = new Map<number, number>();
  let start = 0;
  events.forEach(({ phase, event }, ordinal) => {
    if (phase.isApplyExtrinsic) return;
    if (event.section !== "scheduler" || !["Dispatched", "CallUnavailable"].includes(event.method)) return;
    const index = refs.get(event.data[1]?.unwrapOrDefault()?.toHex());
    if (index !== undefined) {
      for (let i = start; i <= ordinal; i++) if (!events[i].phase.isApplyExtrinsic) byEvent.set(i, index);
    }
    start = ordinal + 1;
  });

  const hasVotes = events.some(({ phase, event }) => phase.isApplyExtrinsic && event.section === "convictionVoting" && event.method === "Voted");
  const signedForCalls = hasVotes || successful.size > 1 ? await api.rpc.chain.getBlock(hash) : null;
  const nominations = new Map<number, Set<string>>();
  signedForCalls?.block.extrinsics.forEach((extrinsic, index) => {
    if (!extrinsic.isSigned || !successful.has(index)) return;
    const calls = matchingCalls(extrinsic.method, "nominationPools", "nominate");
    if (calls.length) nominations.set(index, new Set(calls.map((call) => call.args[0].toString())));
  });
  const hasPoolEvents = events.some(({ event }) => event.section === "nominationPools" && OPERATIONS.has(event.method));
  const membership = hasPoolEvents || nominations.size > 0 ? await at.query.nominationPools?.poolMembers(TREASURY_ADDRESS) : null;
  const poolId = membership?.isSome ? membership.unwrap().poolId.toString() : null;
  let nominationChange: { tx: number; targets: string[] } | null = null;
  const matchingNominations = nominations.size && poolId !== null
    ? [...nominations.entries()].filter(([, ids]) => ids.has(poolId)) : [];
  if (matchingNominations.length === 1) {
    const account = poolBondedAccount(at.consts.nominationPools.palletId.toHex(), at.registry.createType("u32", poolId).toHex());
    const before = await api.at(await api.rpc.chain.getBlockHash(block - 1));
    const [old, latest] = await Promise.all([before.query.staking.nominators(account), at.query.staking.nominators(account)]);
    if (latest.isSome && (old.isNone || !latest.unwrap().targets.eq(old.unwrap().targets))) {
      nominationChange = { tx: matchingNominations[0][0], targets: Array.from(latest.unwrap().targets as Iterable<any>, (target) => target.toString()) };
    }
  }
  const grouped = events.flatMap(({ event, phase }, ordinal) => {
    const { section, method, data } = event;
    const fields: string[] = Array.from(data, (field: any) => field.toString());
    const refIndex = byEvent.get(ordinal) ?? null;
    const tx = phase.isApplyExtrinsic ? phase.asApplyExtrinsic.toNumber() : null;
    const base = { block, ordinal, refIndex, spendIndex: null as number | null, tx, data: fields };
    if (section === "system" && method === "ExtrinsicSuccess" && nominationChange && nominationChange.tx === tx) {
      return [{ ...base, kind: "Nominated", data: nominationChange.targets }];
    }
    if (section === "staking" && method === "Slashed") return [{ ...base, kind: "ValidatorSlashed" }];
    if (section === "imOnline" && method === "SomeOffline") {
      const accounts = Array.from(data[0] as Iterable<any>, (entry) => (entry[0] ?? entry).toString());
      return [{ ...base, kind: "ValidatorsOffline", data: accounts }];
    }
    if (section === "treasury" && method === "Awarded") return [{ ...base, kind: "LegacyAwarded" }];
    if (section === "treasury" && SPENDS.has(method)) return [{ ...base, kind: method, spendIndex: Number(fields[0]) }];
    if (section === "balances" && method === "Transfer" &&
      (sameAccount(fields[0], TREASURY_ADDRESS) || sameAccount(fields[1], TREASURY_ADDRESS))) return [{ ...base, kind: "Transfer" }];
    if (section === "nominationPools" && OPERATIONS.has(method) &&
      (sameAccount(fields[0], TREASURY_ADDRESS) ||
      (poolId !== null && (["StateChanged", "RolesUpdated", "PoolSlashed", "UnbondingPoolSlashed"].includes(method) ? fields[0] : fields[1]) === poolId))) {
      return [{ ...base, kind: method }];
    }
    if (section === "convictionVoting" && method === "Voted" && tx !== null) {
      const call = signedForCalls?.block.extrinsics[tx]?.method;
      const candidates = matchingCalls(call, "convictionVoting", "vote").filter((candidate) => candidate.args[1].toHex() === data[1].toHex());
      const index = candidates.length ? candidates[0].args[0].toNumber() : null;
      if (index === null || candidates.some((candidate) => candidate.args[0].toNumber() !== index)) return [];
      const vote = parseDirectVote(data[1]);
      if (!vote) return [];
      const direction = vote.kind === "standard" ? vote.aye !== null ? "Aye" : "Nay"
        : vote.abstain && !vote.aye?.match(/[1-9]/) && !vote.nay?.match(/[1-9]/) ? "Abstain" : "Split vote";
      return [{ ...base, refIndex: index, kind: "VoteCast", data: [fields[0], direction, directVoteCapital(vote).toString()] }];
    }
    if (refIndex === null) return [];
    if (section === "scheduler" && ["Dispatched", "CallUnavailable"].includes(method)) {
      return [{ ...base, kind: method === "Dispatched" && data[2].isOk ? "Executed" : "ExecutionFailed" }];
    }
    const resultIndex = FAILURES[`${section}.${method}`];
    if (resultIndex !== undefined) {
      const result = data[resultIndex];
      if (result?.isErr || ["BatchInterrupted", "ItemFailed"].includes(method)) {
        const error = result.isErr ? result.asErr : result;
        let decoded: { section: string; name: string } | null = null;
        try { if (error.isModule) decoded = at.registry.findMetaError(error.asModule); } catch { /* Preserve the runtime error bytes. */ }
        return [{ ...base, kind: "NestedFailure", data: [`${section}.${method}`, decoded ? `${decoded.section}.${decoded.name}` : error.toString()] }];
      }
    }
    return [];
  });
  if (!grouped.length) return;
  const [now, signed] = await Promise.all([
    at.query.timestamp.now(),
    signedForCalls ?? (grouped.some((item: { tx: number | null }) => item.tx !== null) ? api.rpc.chain.getBlock(hash) : null),
  ]);
  await prisma.treasuryEvent.createMany({
    skipDuplicates: true,
    data: grouped.map(({ tx, ...item }: (typeof grouped)[number]) => ({
      ...item, timestamp: new Date(Number(now.toString())),
      txHash: tx === null ? null : signed?.block.extrinsics[tx]?.hash.toHex(),
    })),
  });
}

function matchingCalls(value: any, section: string, method: string): any[] {
  if (Array.isArray(value)) return value.flatMap((item) => matchingCalls(item, section, method));
  if (!value?.section || !value?.args) return [];
  if (value.section === section && value.method === method) return [value];
  return Array.from(value.args as Iterable<any>).flatMap((arg) => matchingCalls(arg, section, method));
}

export async function treasuryHistory(refIndex?: number) {
  const cursor = await prisma.treasuryHistoryCursor.findUnique({ where: { id: 1 } });
  const approvalRows = await prisma.treasuryEvent.findMany({
    where: { kind: "AssetSpendApproved", ...(refIndex === undefined ? {} : { refIndex }) },
    orderBy: [{ block: "desc" }, { ordinal: "desc" }], take: 200,
  });
  const spendIndices = approvalRows.flatMap((row) => row.spendIndex === null ? [] : [row.spendIndex]);
  const history = await prisma.treasuryEvent.findMany({
    where: refIndex === undefined ? { kind: { notIn: ["Executed", "NestedFailure", "ExecutionFailed", "VoteCast", "ValidatorSlashed", "ValidatorsOffline"] } }
      : { OR: [{ refIndex }, { spendIndex: { in: spendIndices } }] },
    orderBy: [{ block: "desc" }, { ordinal: "desc" }], take: 200,
  });
  const [validatorSignals, rewardTotals] = refIndex === undefined ? await Promise.all([
    prisma.treasuryEvent.findMany({
      where: { kind: { in: ["ValidatorSlashed", "ValidatorsOffline"] }, timestamp: { gte: new Date(Date.now() - 30 * 86400_000) } },
      orderBy: [{ block: "desc" }, { ordinal: "desc" }], take: 500,
    }),
    prisma.$queryRaw<{ total: string; month: string; latest: Date | null }[]>`
      SELECT COALESCE(SUM(("data"->>2)::numeric), 0)::text AS total,
        COALESCE(SUM(("data"->>2)::numeric) FILTER (WHERE "timestamp" >= NOW() - INTERVAL '30 days'), 0)::text AS month,
        MAX("timestamp") AS latest
      FROM "TreasuryEvent" WHERE "kind" = 'PaidOut' AND "data"->>0 = ${TREASURY_ADDRESS}
    `,
  ]) : [[], []];
  const rows = new Map([...approvalRows, ...history, ...validatorSignals].map((row) => [`${row.block}:${row.ordinal}`, row]));
  const events: TreasuryEventDto[] = Array.from(rows.values()).sort((a, b) => b.block - a.block || b.ordinal - a.ordinal)
    .map((row) => ({ ...row, timestamp: row.timestamp.toISOString(), data: row.data as string[] }));
  return { events, trackingSince: cursor?.fromBlock ?? null, indexedThrough: cursor?.lastBlock ?? null, rewards: rewardTotals[0] ?? null };
}
