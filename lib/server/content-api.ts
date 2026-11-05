import { NextResponse } from "next/server";
import { sameAccount } from "../chain/address";
import { payloadGovernance, type GovernanceKind } from "../sima";
import { prisma } from "./db";
import { lockReferendumContent } from "./advisory-lock";
import { resolveReferendumContext } from "./referendum-context";
import { verifySimaMessage } from "./verify";

const contentSelect = {
  index: true, title: true, contentMd: true, proposer: true,
  trackId: true, metadataHash: true, updatedAt: true,
} as const;
const defaultServices = { db: prisma, resolve: resolveReferendumContext };
type Services = typeof defaultServices;

export async function listContent(kind: GovernanceKind, { db } = defaultServices) {
  try {
    const rows = kind === "token"
      ? await db.referendum.findMany({ select: {
          index: true, title: true, trackId: true, contentMd: true,
          _count: { select: { comments: true } },
        } })
      : await db.fellowshipContent.findMany({ select: {
          index: true, title: true, trackId: true, contentMd: true,
        } });
    return NextResponse.json({ titles: rows.map((row) => ({
      index: row.index, title: row.title, trackId: row.trackId,
      blob: `${row.title ?? ""} ${row.contentMd ?? ""}`.toLowerCase().slice(0, 6000),
      ...(kind === "token" && "_count" in row
        ? { commentCount: row._count.comments }
        : {}),
    })) });
  } catch (error) {
    console.error("Could not list referendum content", error);
    return NextResponse.json({ error: "Could not load referendum content." }, { status: 503 });
  }
}

export async function readContent(kind: GovernanceKind, index: number, services = defaultServices) {
  if (!Number.isSafeInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid index." }, { status: 400 });
  }
  try {
    const row = kind === "token"
      ? await services.db.referendum.findUnique({ where: { index }, select: contentSelect })
      : await services.db.fellowshipContent.findUnique({ where: { index }, select: contentSelect });
    if (row || kind === "token") return NextResponse.json({ content: row });
    const ref = await services.resolve(kind, index);
    if (!ref) return NextResponse.json({ error: "Referendum not found." }, { status: 404 });
    return NextResponse.json({ content: {
      index, title: null, contentMd: null, metadataHash: null,
      proposer: ref.proposer, trackId: ref.trackId,
    } });
  } catch (error) {
    console.error("Could not read referendum content", error);
    return NextResponse.json({ error: "Could not load referendum content." }, { status: 503 });
  }
}

export async function saveContent(kind: GovernanceKind, req: Request, services: Services = defaultServices) {
  const verified = verifySimaMessage(await req.json().catch(() => null));
  if ("error" in verified) return NextResponse.json({ error: verified.error }, { status: 400 });
  const { payload, payloadJson, address, signature, contentHash } = verified;
  if (payload.action !== "provide_context" || payloadGovernance(payload) !== kind) {
    return NextResponse.json({ error: "Wrong action or governance kind for this endpoint." }, { status: 400 });
  }
  if (!payload.title?.trim() || payload.content === undefined) {
    return NextResponse.json({ error: "title and content are required." }, { status: 400 });
  }
  const title = payload.title;
  const contentMd = payload.content;
  try {
    const ref = await services.resolve(kind, payload.refIndex);
    if (!ref) return NextResponse.json({ error: "Referendum not found on chain." }, { status: 404 });
    if (!sameAccount(ref.proposer, address)) {
      return NextResponse.json({ error: "Only the referendum proposer can edit its title and description." }, { status: 403 });
    }
    const proposer = ref.proposer!;
    const stored = await services.db.$transaction(async (tx) => {
      await lockReferendumContent(tx, payload.refIndex, kind);
      const current = kind === "token"
        ? await tx.referendum.findUnique({ where: { index: payload.refIndex }, select: { contentPayload: true } })
        : await tx.fellowshipContent.findUnique({ where: { index: payload.refIndex }, select: { contentPayload: true } });
      const oldTimestamp = (current?.contentPayload as { timestamp?: unknown } | null)?.timestamp;
      if (typeof oldTimestamp === "number" && oldTimestamp >= payload.timestamp) return false;
      const data = {
        title, contentMd, contentSig: signature,
        contentPayload: JSON.parse(payloadJson), metadataHash: contentHash,
      };
      if (kind === "token") {
        await tx.referendum.upsert({
          where: { index: payload.refIndex },
          create: { index: payload.refIndex, trackId: ref.trackId, proposer, status: ref.phase, ...data },
          update: data,
        });
      } else {
        await tx.fellowshipContent.upsert({
          where: { index: payload.refIndex },
          create: { index: payload.refIndex, trackId: ref.trackId, proposer, ...data },
          update: data,
        });
      }
      return true;
    });
    return stored
      ? NextResponse.json({ ok: true, contentHash })
      : NextResponse.json({ error: "This content is older than the stored version." }, { status: 409 });
  } catch (error) {
    console.error("Could not save referendum content", error);
    return NextResponse.json({ error: "Could not save referendum content. Please try again." }, { status: 503 });
  }
}
