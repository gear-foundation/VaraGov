import { NextResponse } from "next/server";
import { BN } from "@polkadot/util";
import { prisma } from "@/lib/server/db";
import { getServerApi } from "@/lib/server/chain";
import { verifySimaMessage } from "@/lib/server/verify";
import { lockCommentAuthor } from "@/lib/server/advisory-lock";
import { parseReferendumInfo } from "@/lib/chain/referenda";

const RATE_LIMIT_PER_HOUR = 10;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ index: string }> },
) {
  const { index } = await params;
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) {
    return NextResponse.json({ error: "Invalid index." }, { status: 400 });
  }
  const comments = await prisma.comment.findMany({
    where: { refIndex: idx },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      author: true,
      contentMd: true,
      replyToId: true,
      createdAt: true,
      editedAt: true,
    },
  });
  return NextResponse.json({ comments });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ index: string }> },
) {
  const { index } = await params;
  const idx = Number(index);
  if (!Number.isSafeInteger(idx) || idx < 0) {
    return NextResponse.json({ error: "Invalid index." }, { status: 400 });
  }
  const verified = verifySimaMessage(await req.json().catch(() => null));
  if ("error" in verified) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }
  const { payload, payloadJson, address, signature } = verified;
  if (
    (payload.action !== "comment" && payload.action !== "edit_comment") ||
    payload.refIndex !== idx
  ) {
    return NextResponse.json({ error: "Wrong action or index." }, { status: 400 });
  }
  if (!payload.content?.trim()) {
    return NextResponse.json({ error: "Empty comment." }, { status: 400 });
  }
  const content = payload.content;

  // Anti-spam: a funded account (>= existential deposit) plus a per-address rate limit.
  const api = await getServerApi();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [account, info]: any[] = await Promise.all([
    api.query.system.account(address),
    api.query.referenda.referendumInfoFor(idx),
  ]);
  const ref = parseReferendumInfo(idx, info);
  if (!ref) {
    return NextResponse.json({ error: `Referendum #${idx} not found on chain.` }, { status: 404 });
  }
  const ed = (api.consts.balances.existentialDeposit as unknown as BN).toString();
  const free = account.data.free.toBn() as BN;
  if (free.lt(new BN(ed))) {
    return NextResponse.json(
      { error: "Commenting requires an account holding at least the existential deposit of VARA." },
      { status: 403 },
    );
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize writes per author so concurrent requests cannot bypass the rate limit.
      await lockCommentAuthor(tx, address);

      if (payload.action === "edit_comment") {
        if (!payload.commentId) return { error: "commentId is required.", status: 400 };
        const target = await tx.comment.findUnique({ where: { id: payload.commentId } });
        if (!target || target.refIndex !== idx) {
          return { error: "Comment not found.", status: 404 };
        }
        if (target.author !== address) {
          return { error: "Only the comment author can edit it.", status: 403 };
        }
        const oldTimestamp = (target.payload as { timestamp?: unknown } | null)?.timestamp;
        if (typeof oldTimestamp === "number" && oldTimestamp >= payload.timestamp) {
          return { error: "This edit is older than the stored comment.", status: 409 };
        }
        await tx.commentSignature.create({
          data: { signature, commentId: target.id },
        });
        await tx.comment.update({
          where: { id: target.id },
          data: {
            contentMd: content,
            signature,
            payload: JSON.parse(payloadJson),
            editedAt: new Date(),
          },
        });
        return { id: target.id };
      }

      const recent = await tx.comment.count({
        where: { author: address, createdAt: { gte: new Date(Date.now() - 3600_000) } },
      });
      if (recent >= RATE_LIMIT_PER_HOUR) {
        return {
          error: `Rate limit: at most ${RATE_LIMIT_PER_HOUR} comments per hour per address.`,
          status: 429,
        };
      }
      if (payload.replyTo) {
        const parent = await tx.comment.findUnique({ where: { id: payload.replyTo } });
        if (!parent || parent.refIndex !== idx || parent.replyToId !== null) {
          return { error: "Reply target must be a top-level comment.", status: 400 };
        }
      }

      await tx.referendum.upsert({
        where: { index: idx },
        create: {
          index: idx,
          trackId: ref.trackId,
          proposer: ref.proposer,
          status: ref.phase,
        },
        update: {},
      });
      const comment = await tx.comment.create({
        data: {
          refIndex: idx,
          author: address,
          contentMd: content,
          signature,
          payload: JSON.parse(payloadJson),
          replyToId: payload.replyTo ?? null,
        },
        select: { id: true },
      });
      await tx.commentSignature.create({
        data: { signature, commentId: comment.id },
      });
      return { id: comment.id };
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "This exact message was already posted." }, { status: 409 });
    }
    console.error("Failed to store comment", error);
    return NextResponse.json({ error: "Could not store the comment." }, { status: 500 });
  }
}
