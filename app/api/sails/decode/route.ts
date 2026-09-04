import { NextResponse } from "next/server";
import { loadProgramIdl } from "../../../../lib/server/idl-registry";
import { decodeSailsPayload } from "../../../../lib/server/sails-decoder";

const PROGRAM_ID = /^0x[0-9a-fA-F]{64}$/;
const PAYLOAD = /^0x(?:[0-9a-fA-F]{2}){1,131072}$/;
const MAX_BODY_CHARS = 270_000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BODY_CHARS) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("programId" in body) ||
    !("payload" in body) ||
    typeof body.programId !== "string" ||
    typeof body.payload !== "string" ||
    !PROGRAM_ID.test(body.programId) ||
    !PAYLOAD.test(body.payload)
  ) {
    return NextResponse.json({ error: "Invalid programId or payload" }, { status: 400 });
  }

  const idl = await loadProgramIdl(body.programId);
  if (!idl) return NextResponse.json({ error: "IDL not registered" }, { status: 404 });
  try {
    return NextResponse.json(await decodeSailsPayload(idl, body.payload as `0x${string}`));
  } catch {
    return NextResponse.json({ error: "Payload does not match registered IDL" }, { status: 422 });
  }
}
