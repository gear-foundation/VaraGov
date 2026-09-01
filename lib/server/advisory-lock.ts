import type { Prisma } from "../generated/prisma/client";

export async function lockCommentAuthor(
  tx: Prisma.TransactionClient,
  address: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${address}, 0))`;
}

export async function lockReferendumContent(
  tx: Prisma.TransactionClient,
  refIndex: number,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${refIndex})`;
}
