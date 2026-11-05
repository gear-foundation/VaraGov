import type { ApiPromise } from "@polkadot/api";
import { fetchAllReferenda, parseReferendumInfo, type Referendum } from "./referenda";
import { getTracks } from "./tracks";

export async function tokenSnapshot(api: ApiPromise, index?: number) {
  const hash = await api.rpc.chain.getFinalizedHead();
  const [at, header] = await Promise.all([api.at(hash), api.rpc.chain.getHeader(hash)]);
  const [total, inactive, referenda] = await Promise.all([
    at.query.balances.totalIssuance(),
    at.query.balances.inactiveIssuance(),
    index === undefined
      ? fetchAllReferenda(at as unknown as ApiPromise)
      : at.query.referenda.referendumInfoFor(index).then((info) => {
          const referendum = parseReferendumInfo(index, info);
          return referendum ? [referendum] : [];
        }),
  ]);
  const tracks = getTracks(at as unknown as ApiPromise);
  const activeIssuance = total.toBn().sub(inactive.toBn());
  const atBlock = header.number.toNumber();
  return referenda.map((referendum): Referendum => ({
    ...referendum,
    snapshot: { atBlock, activeIssuance, track: tracks.find((track) => track.id === referendum.trackId) },
  }));
}
