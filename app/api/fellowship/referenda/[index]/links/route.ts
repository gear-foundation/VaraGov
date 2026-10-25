import { NextResponse } from "next/server";
import { getArchiveApi } from "@/lib/server/chain";
import { findFellowshipWhitelistLinks } from "@/lib/server/whitelist-links";

export const dynamic = "force-dynamic";

type CacheEntry = {
  expiresAt: number;
  value: ReturnType<typeof findFellowshipWhitelistLinks>;
};

const globalCache = globalThis as unknown as {
  fellowshipWhitelistLinkCache?: Map<number, CacheEntry>;
};
const cache =
  globalCache.fellowshipWhitelistLinkCache ??
  (globalCache.fellowshipWhitelistLinkCache = new Map());

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ index: string }> },
) {
  const { index } = await params;
  const fellowshipIndex = Number(index);
  if (!Number.isInteger(fellowshipIndex) || fellowshipIndex < 0) {
    return NextResponse.json({ error: "Invalid index." }, { status: 400 });
  }

  try {
    const now = Date.now();
    const cached = cache.get(fellowshipIndex);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(await cached.value);
    }

    const value = getArchiveApi().then((api) =>
      findFellowshipWhitelistLinks(api, fellowshipIndex),
    );
    cache.set(fellowshipIndex, { expiresAt: now + 60_000, value });
    return NextResponse.json(await value);
  } catch (error) {
    cache.delete(fellowshipIndex);
    console.error(`[api/fellowship/referenda/${fellowshipIndex}/links]`, error);
    return NextResponse.json(
      { error: "Could not resolve linked execution referenda." },
      { status: 502 },
    );
  }
}
