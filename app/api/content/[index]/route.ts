import { readContent } from "@/lib/server/content-api";

export async function GET(_req: Request, { params }: { params: Promise<{ index: string }> }) {
  return readContent("token", Number((await params).index));
}
