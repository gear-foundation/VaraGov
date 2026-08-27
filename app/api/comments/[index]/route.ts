import { NextResponse } from "next/server";
import { BN } from "@polkadot/util";
import { prisma } from "@/lib/server/db";
import { getServerApi } from "@/lib/server/chain";
import { verifySimaMessage } from "@/lib/server/verify";

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
  const verified = verifySimaMessage(await req.json().catch(() => null));
  if ("error" in verified) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }
  const { payload, payloadJson, address, signature } = verified;
  if (payload.action !== "comment" || payload.refIndex !== idx) {
    return NextResponse.json({ error: "Wrong action or index." }, { status: 400 });
  }
  if (!payload.content?.trim()) {
    return NextResponse.json({ error: "Empty comment." }, { status: 400 });
  }

  // Anti-spam: a funded account (>= existential deposit) plus a per-address rate limit.
  const api = await getServerApi();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const account: any = await api.query.system.account(address);
  const ed = (api.consts.balances.existentialDeposit as unknown as BN).toString();
  const free = account.data.free.toBn() as BN;
  if (free.lt(new BN(ed))) {
    return NextResponse.json(
      { error: "Commenting requires an account holding at least the existential deposit of VARA." },
      { status: 403 },
    );
  }
  const recent = await prisma.comment.count({
    where: { author: address, createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  if (recent >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: `Rate limit: at most ${RATE_LIMIT_PER_HOUR} comments per hour per address.` },
      { status: 429 },
    );
  }
  if (payload.replyTo) {
    const parent = await prisma.comment.findUnique({ where: { id: payload.replyTo } });
    if (!parent || parent.refIndex !== idx) {
      return NextResponse.json({ error: "Reply target not found." }, { status: 400 });
    }
  }

  // FK target row; chain state is filled in by the worker (phase 5).
  await prisma.referendum.upsert({
    where: { index: idx },
    create: { index: idx },
    update: {},
  });

  try {
    const comment = await prisma.comment.create({
      data: {
        refIndex: idx,
        author: address,
        contentMd: payload.content,
        signature,
        payload: JSON.parse(payloadJson),
        replyToId: payload.replyTo ?? null,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: comment.id });
  } catch {
    // Unique(signature) — same signed message posted twice.
    return NextResponse.json({ error: "This exact message was already posted." }, { status: 409 });
  }
}
