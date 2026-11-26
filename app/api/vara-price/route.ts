export async function GET() {
  try {
    const key = process.env.COINGECKO_DEMO_API_KEY;
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=vara-network&vs_currencies=usd&include_last_updated_at=true",
      { headers: key ? { "x-cg-demo-api-key": key } : {}, next: { revalidate: 120 }, signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new Error("Price feed unavailable");
    const price = (await response.json())["vara-network"];
    if (!Number.isFinite(price?.usd) || price.usd <= 0 || !Number.isFinite(price.last_updated_at)) {
      throw new Error("Invalid quote");
    }
    return Response.json({ usd: price.usd, updatedAt: price.last_updated_at * 1000 });
  } catch {
    return Response.json({ error: "VARA/USD quote unavailable" }, { status: 503 });
  }
}
