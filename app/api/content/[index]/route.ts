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
      title: true,
      contentMd: true,
      proposer: true,
      metadataHash: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ content: row });
}
