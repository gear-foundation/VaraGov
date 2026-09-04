import { prisma } from "./db";

export type ReferendumShareData = {
  title: string;
  description: string;
  eyebrow: string;
  badge: string;
  number?: number;
};

const TRACK_NAMES: Record<number, string> = {
  0: "Root",
  1: "Whitelisted Caller",
  10: "Staking Admin",
  11: "Treasurer",
  12: "Lease Admin",
  13: "Fellowship Admin",
  14: "General Admin",
  15: "Auction Admin",
  20: "Referendum Canceller",
  21: "Referendum Killer",
  30: "Small Tipper",
  31: "Big Tipper",
  32: "Small Spender",
  33: "Medium Spender",
  34: "Big Spender",
};

function cleanText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const plain = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#>*_~`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  return plain.length <= maxLength ? plain : `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}

export async function getTokenReferendumShareData(
  index: number,
): Promise<ReferendumShareData> {
  const validIndex = Number.isInteger(index) && index >= 0;
  const fallback: ReferendumShareData = {
    title: validIndex ? `Referendum #${index}` : "VaraGov referendum",
    description: "Token-holder governance proposal on Vara Network.",
    eyebrow: "Vara Network · Token-holder governance",
    badge: "Public OpenGov",
    number: validIndex ? index : undefined,
  };

  if (!validIndex) return fallback;
  try {
    const row = await prisma.referendum.findUnique({
      where: { index },
      select: { title: true, contentMd: true, trackId: true },
    });
    if (!row) return fallback;
    return {
      ...fallback,
      title: cleanText(row.title, 110) ?? fallback.title,
      description: cleanText(row.contentMd, 190) ?? fallback.description,
      badge:
        row.trackId === null
          ? fallback.badge
          : TRACK_NAMES[row.trackId] ?? `Track ${row.trackId}`,
    };
  } catch {
    return fallback;
  }
}

export function getFellowshipReferendumShareData(index: number): ReferendumShareData {
  const validIndex = Number.isInteger(index) && index >= 0;
  return {
    title: validIndex ? `Fellowship referendum #${index}` : "Fellowship referendum",
    description: "Ranked-collective governance proposal on Vara Network.",
    eyebrow: "Vara Network · Ranked collective",
    badge: "Fellowship",
    number: validIndex ? index : undefined,
  };
}
