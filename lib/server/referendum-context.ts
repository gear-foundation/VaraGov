import { parseReferendumInfo } from "../chain/referenda";
import type { GovernanceKind } from "../sima";
import { getArchiveApi, getServerApi } from "./chain";

export async function resolveReferendumContext(
  kind: GovernanceKind,
  index: number,
  sources = { getApi: getServerApi, getArchiveApi },
) {
  const api = await sources.getApi();
  const pallet = kind === "fellowship" ? "fellowshipReferenda" : "referenda";
  const current = parseReferendumInfo(index, await api.query[pallet].referendumInfoFor(index));
  if (!current || current.decidedAt === null) return current;
  const archive = await sources.getArchiveApi();
  const hash = await archive.rpc.chain.getBlockHash(Math.max(0, current.decidedAt - 1));
  const before = await archive.at(hash);
  const historical = parseReferendumInfo(index, await before.query[pallet].referendumInfoFor(index));
  return {
    ...current,
    proposer: historical?.proposer ?? current.proposer,
    trackId: historical?.trackId ?? current.trackId,
    submittedAt: historical?.submittedAt ?? current.submittedAt,
    proposalHash: historical?.proposalHash ?? current.proposalHash,
    proposalLen: historical?.proposalLen ?? current.proposalLen,
    inlineHex: historical?.inlineHex ?? current.inlineHex,
  };
}
