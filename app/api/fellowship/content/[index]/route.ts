import { readContent } from "@/lib/server/content-api";

export async function GET(_req: Request, { params }: { params: Promise<{ index: string }> }) {
  return readContent("fellowship", Number((await params).index));
}
