import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { getServerApi } from "@/lib/server/chain";
import { verifySimaMessage } from "@/lib/server/verify";
import { lockReferendumContent } from "@/lib/server/advisory-lock";
import { parseReferendumInfo } from "@/lib/chain/referenda";

export async function GET() {
  // Per-referendum meta map for the list: off-chain titles plus the trackId
  // (pruned from chain state once decided) plus a lowercase search blob over
  // title + description for the client-side quick filter. 78 referenda —
  // shipping the blob beats a search endpoint.
  const rows = await prisma.referendum.findMany({
    select: { index: true, title: true, trackId: true, contentMd: true },
  });
  return NextResponse.json({
    titles: rows.map((r) => ({
      index: r.index,
      title: r.title,
      trackId: r.trackId,
      blob: `${r.title ?? ""} ${r.contentMd ?? ""}`.toLowerCase().slice(0, 6000),
    })),
  });
}

export async function POST(req: Request) {
  const verified = verifySimaMessage(await req.json().catch(() => null));
  if ("error" in verified) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }
  const { payload, payloadJson, address, signature, contentHash } = verified;
  if (payload.action !== "provide_context") {
    return NextResponse.json({ error: "Wrong action for this endpoint." }, { status: 400 });
  }
  if (!payload.title?.trim() || payload.content === undefined) {
    return NextResponse.json({ error: "title and content are required." }, { status: 400 });
  }

  // Only the on-chain proposer may set a referendum's title/description.
  const api = await getServerApi();
  const info = await api.query.referenda.referendumInfoFor(payload.refIndex);
  const ref = parseReferendumInfo(payload.refIndex, info);
  if (!ref) {
    return NextResponse.json(
      { error: `Referendum #${payload.refIndex} not found on chain.` },
      { status: 404 },
    );
  }
  if (!ref.proposer) {
    return NextResponse.json(
      { error: "On-chain proposer is unknown for this referendum (deposit refunded); cannot verify authorship." },
      { status: 403 },
    );
  }
  if (ref.proposer !== address) {
    return NextResponse.json(
      { error: "Only the referendum proposer can edit its title and description." },
      { status: 403 },
    );
  }

  const stored = await prisma.$transaction(async (tx) => {
    // Prevent a delayed/replayed request from overwriting a newer signed version.
    await lockReferendumContent(tx, payload.refIndex);
    const current = await tx.referendum.findUnique({
      where: { index: payload.refIndex },
      select: { contentPayload: true },
    });
    const oldTimestamp = (current?.contentPayload as { timestamp?: unknown } | null)?.timestamp;
    if (typeof oldTimestamp === "number" && oldTimestamp >= payload.timestamp) return false;

    await tx.referendum.upsert({
      where: { index: payload.refIndex },
      create: {
        index: payload.refIndex,
        trackId: ref.trackId,
        proposer: ref.proposer,
        status: ref.phase,
        title: payload.title,
        contentMd: payload.content,
        contentSig: signature,
        contentPayload: JSON.parse(payloadJson),
        metadataHash: contentHash,
      },
      update: {
        title: payload.title,
        contentMd: payload.content,
        contentSig: signature,
        contentPayload: JSON.parse(payloadJson),
        metadataHash: contentHash,
      },
    });
    return true;
  });
  if (!stored) {
    return NextResponse.json(
      { error: "This content is older than the stored version." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, contentHash });
}
