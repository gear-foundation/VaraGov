import { treasuryHistory, treasuryInflows } from "@/lib/server/treasury-events";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ref = params.get("ref");
  const inflows = params.get("inflows");
  if (inflows !== null && (inflows !== "fees" || ref !== null)) {
    return Response.json({ error: "Invalid inflows filter" }, { status: 400 });
  }
  if (ref !== null && (!/^\d+$/.test(ref) || Number(ref) > 2147483647)) {
    return Response.json({ error: "Invalid referendum index" }, { status: 400 });
  }
  try {
    if (inflows === "fees") return Response.json({ fees: await treasuryInflows("fees") });
    return Response.json(await treasuryHistory(ref === null ? undefined : Number(ref)));
  } catch (error) {
    console.error("Treasury history unavailable", error);
    return Response.json({ error: "Treasury history unavailable" }, { status: 503 });
  }
}
