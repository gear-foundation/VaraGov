import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ index: string }> },
) {
  const { index } = await params;
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) {
    return NextResponse.json({ error: "Invalid index." }, { status: 400 });
  }
  const row = await prisma.referendum.findUnique({
    where: { index: idx },
    select: {
      index: true,
      trackId: true,
      proposer: true,
      status: true,
      submittedAt: true,
      decidedAt: true,
      finalTally: true,
    },
  });
  const votes = await prisma.vote.findMany({
    where: { refIndex: idx },
    orderBy: [{ aye: { sort: "desc", nulls: "last" } }],
    take: 500,
    select: {
      voter: true,
      kind: true,
      aye: true,
      nay: true,
      abstain: true,
      conviction: true,
    },
  });
  return NextResponse.json({
    referendum: row,
    votes: votes.map((v) => ({
      ...v,
      aye: v.aye?.toString() ?? null,
      nay: v.nay?.toString() ?? null,
      abstain: v.abstain?.toString() ?? null,
    })),
  });
}
