import { treasuryHistory } from "@/lib/server/treasury-events";
export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref");
  if (ref !== null && (!/^\d+$/.test(ref) || Number(ref) > 2147483647)) {
    return Response.json({ error: "Invalid referendum index" }, { status: 400 });
  }
  try {
    return Response.json(await treasuryHistory(ref === null ? undefined : Number(ref)));
  } catch (error) {
    console.error("Treasury history unavailable", error);
    return Response.json({ error: "Treasury history unavailable" }, { status: 503 });
  }
}
