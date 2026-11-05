import { listContent, saveContent } from "@/lib/server/content-api";

export async function GET() {
  return listContent("token");
}

export async function POST(req: Request) {
  return saveContent("token", req);
}
