import type { ApiPromise } from "@polkadot/api";
import { blake2AsHex } from "@polkadot/util-crypto";
import { parseReferendumInfo, type Phase } from "../chain/referenda";
import { prisma } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type WhitelistExecutionLink = {
  index: number;
  phase: Phase;
};

export type FellowshipWhitelistLinks = {
  fellowshipIndex: number;
  proposer: string | null;
  callHash: string | null;
  executions: WhitelistExecutionLink[];
};

type RuntimeCall = {
  section: string;
  method: string;
  args: any[];
};

function isRuntimeCall(value: unknown): value is RuntimeCall {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as RuntimeCall).section === "string" &&
    typeof (value as RuntimeCall).method === "string" &&
    Array.isArray((value as RuntimeCall).args)
  );
}

function findCall(
  call: RuntimeCall,
  predicate: (candidate: RuntimeCall) => boolean,
): RuntimeCall | null {
  if (predicate(call)) return call;
  for (const arg of call.args) {
    if (!isRuntimeCall(arg)) continue;
    const match = findCall(arg, predicate);
    if (match) return match;
  }
  return null;
}

function encodedCall(apiAt: any, proposal: any): RuntimeCall | null {
  try {
    if (!proposal.isInline) return null;
    return apiAt.registry.createType("Call", proposal.asInline) as RuntimeCall;
  } catch {
    return null;
  }
}

async function referendumCall(
  apiAt: any,
  pallet: "referenda" | "fellowshipReferenda",
  index: number,
): Promise<RuntimeCall | null> {
  const info = await apiAt.query[pallet].referendumInfoFor(index);
  if (info.isNone) return null;
  const referendum = info.unwrap();
  if (!referendum.isOngoing) return null;
  const proposal = referendum.asOngoing.proposal;
  const inline = encodedCall(apiAt, proposal);
  if (inline) return inline;
  if (!proposal.isLookup) return null;

  const lookup = proposal.asLookup;
  const preimage = await apiAt.query.preimage.preimageFor([lookup.hash_, lookup.len]);
  if (preimage.isNone) return null;
  try {
    return apiAt.registry.createType("Call", preimage.unwrap()) as RuntimeCall;
  } catch {
    return null;
  }
}

async function apiBeforeTerminal(api: ApiPromise, block: number): Promise<any> {
  const hash = await api.rpc.chain.getBlockHash(Math.max(0, block - 1));
  return api.at(hash);
}

function whitelistCallHash(call: RuntimeCall | null): string | null {
  if (!call) return null;
  const whitelist = findCall(
    call,
    (candidate) =>
      candidate.section === "whitelist" && candidate.method === "whitelistCall",
  );
  const hash = whitelist?.args[0];
  return typeof hash?.toHex === "function" ? hash.toHex() : null;
}

function executionCallHash(call: RuntimeCall | null): string | null {
  if (!call) return null;
  const execution = findCall(
    call,
    (candidate) =>
      candidate.section === "whitelist" &&
      (candidate.method === "dispatchWhitelistedCallWithPreimage" ||
        candidate.method === "dispatchWhitelistedCall"),
  );
  if (!execution) return null;

  const first = execution.args[0];
  if (execution.method === "dispatchWhitelistedCallWithPreimage") {
    return typeof first?.toU8a === "function" ? blake2AsHex(first.toU8a()) : null;
  }
  return typeof first?.toHex === "function" ? first.toHex() : null;
}

async function fellowshipSource(
  api: ApiPromise,
  index: number,
): Promise<{ proposer: string | null; callHash: string | null }> {
  const currentInfo = await api.query.fellowshipReferenda.referendumInfoFor(index);
  const current = parseReferendumInfo(index, currentInfo);
  if (!current) return { proposer: null, callHash: null };

  const apiAt = current.decidedAt === null
    ? api
    : await apiBeforeTerminal(api, current.decidedAt);
  const historicalInfo = await apiAt.query.fellowshipReferenda.referendumInfoFor(index);
  const historical = parseReferendumInfo(index, historicalInfo);
  const call = await referendumCall(apiAt, "fellowshipReferenda", index);
  return {
    proposer: historical?.proposer ?? current.proposer,
    callHash: whitelistCallHash(call),
  };
}

async function currentExecutions(
  api: ApiPromise,
  targetHash: string,
): Promise<Map<number, WhitelistExecutionLink>> {
  const matches = new Map<number, WhitelistExecutionLink>();
  const entries = await api.query.referenda.referendumInfoFor.entries();
  for (const [key, info] of entries) {
    const index = (key.args[0] as any).toNumber();
    const referendum = parseReferendumInfo(index, info);
    if (!referendum || referendum.trackId !== 1 || referendum.decidedAt !== null) continue;
    const call = await referendumCall(api, "referenda", index);
    if (executionCallHash(call) === targetHash) {
      matches.set(index, { index, phase: referendum.phase });
    }
  }
  return matches;
}

async function historicalExecutions(
  api: ApiPromise,
  targetHash: string,
  matches: Map<number, WhitelistExecutionLink>,
): Promise<void> {
  const rows = await prisma.referendum.findMany({
    where: { trackId: 1, decidedAt: { not: null } },
    select: { index: true, decidedAt: true, status: true },
    orderBy: { index: "desc" },
  });

  for (const row of rows) {
    if (matches.has(row.index) || row.decidedAt === null) continue;
    const apiAt = await apiBeforeTerminal(api, row.decidedAt);
    const call = await referendumCall(apiAt, "referenda", row.index);
    if (executionCallHash(call) !== targetHash) continue;
    matches.set(row.index, {
      index: row.index,
      phase: row.status as Phase,
    });
  }
}

export async function findFellowshipWhitelistLinks(
  api: ApiPromise,
  fellowshipIndex: number,
): Promise<FellowshipWhitelistLinks> {
  const source = await fellowshipSource(api, fellowshipIndex);
  if (!source.callHash) {
    return {
      fellowshipIndex,
      proposer: source.proposer,
      callHash: null,
      executions: [],
    };
  }

  const matches = await currentExecutions(api, source.callHash);
  try {
    await historicalExecutions(api, source.callHash, matches);
  } catch (error) {
    // The current on-chain link remains useful when historical DB data is unavailable.
    console.error("[whitelist-links] historical lookup failed:", error);
  }

  return {
    fellowshipIndex,
    proposer: source.proposer,
    callHash: source.callHash,
    executions: Array.from(matches.values()).sort((left, right) => left.index - right.index),
  };
}
