import { treasurySnapshot, type TreasurySnapshot } from "@/lib/server/treasury";

let cached: { until: number; value: TreasurySnapshot } | undefined;
let pending: Promise<TreasurySnapshot> | undefined;

function snapshot(refresh: boolean) {
  if (!refresh && cached && cached.until > Date.now()) return Promise.resolve(cached.value);
  pending ??= treasurySnapshot().then((value) => {
    cached = { value, until: Date.now() + 6000 };
    return value;
  }).finally(() => { pending = undefined; });
  return pending;
}

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("fresh") === "1";
  try {
    return Response.json(await snapshot(refresh), {
      headers: { "Cache-Control": refresh ? "no-store" : "public, s-maxage=6" },
    });
  } catch (error) {
    console.error("Treasury snapshot failed", error);
    return Response.json({ error: "Treasury data unavailable" }, { status: 503 });
  }
}
