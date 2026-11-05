import { listContent, saveContent } from "@/lib/server/content-api";

export async function GET() {
  return listContent("fellowship");
}

export async function POST(req: Request) {
  return saveContent("fellowship", req);
}
