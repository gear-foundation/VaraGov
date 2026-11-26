import { getArchiveApi } from "@/lib/server/chain";
import { decodeProposal, parseReferendumInfo } from "@/lib/chain/referenda";
import type { ApiPromise } from "@polkadot/api";

export async function GET(request: Request, { params }: { params: Promise<{ index: string }> }) {
  const { index: raw } = await params;
  const index = Number(raw);
  const ended = Number(new URL(request.url).searchParams.get("ended"));
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(index) || index > 4294967295 || !Number.isInteger(ended) || ended <= 0 || ended > 4294967295) {
    return Response.json({ error: "Invalid referendum" }, { status: 400 });
  }
  try {
    const api = await getArchiveApi();
    const current = parseReferendumInfo(index, await api.query.referenda.referendumInfoFor(index));
    if (current?.decidedAt !== ended) return Response.json({ error: "Referendum ending block does not match" }, { status: 404 });
    const at = await api.at(await api.rpc.chain.getBlockHash(ended - 1));
    const ref = parseReferendumInfo(index, await at.query.referenda.referendumInfoFor(index));
    const call = ref ? await decodeProposal(at as unknown as ApiPromise, ref, false) : null;
    const anchor = (await at.query.referenda.metadataOf(index)).toJSON();
    return Response.json({ call, anchor, timing: ref ? { submittedAt: ref.submittedAt, decidingSince: ref.decidingSince } : null },
      { headers: { "Cache-Control": "public, max-age=1800" } });
  } catch (error) {
    console.error("Archived proposal unavailable", error);
    return Response.json({ error: "Archived proposal unavailable" }, { status: 503 });
  }
}
