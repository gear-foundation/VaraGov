import type { Prisma } from "../generated/prisma/client";
import type { GovernanceKind } from "../sima";

export async function lockCommentAuthor(
  tx: Prisma.TransactionClient,
  address: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${address}, 0))`;
}

export async function lockReferendumContent(
  tx: Prisma.TransactionClient,
  refIndex: number,
  kind: GovernanceKind = "token",
): Promise<void> {
  // Preserve the token lock key for compatibility during rolling deployments.
  const key = kind === "token" ? refIndex : -refIndex - 1;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key}::bigint)`;
}
