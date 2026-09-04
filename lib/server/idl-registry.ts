import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProgramIdl, ProgramIdlEntry } from "../chain/idl-registry";

type Manifest = { version: 1; programs: ProgramIdlEntry[] };

const PROGRAM_ID = /^0x[0-9a-fA-F]{64}$/;
const SAFE_IDL_PATH = /^\/idl\/programs\/(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+\.idl$/;
const MAX_IDL_BYTES = 1_000_000;

export async function loadProgramIdl(programId: string): Promise<ProgramIdl | null> {
  const normalized = programId.toLowerCase();
  if (!PROGRAM_ID.test(normalized)) return null;
  try {
    const publicRoot = resolve(process.cwd(), "public");
    const manifest = JSON.parse(
      await readFile(resolve(publicRoot, "idl/manifest.json"), "utf8"),
    ) as Partial<Manifest>;
    if (manifest.version !== 1 || !Array.isArray(manifest.programs)) return null;
    const entry = manifest.programs.find(
      (candidate) =>
        typeof candidate.programId === "string" &&
        candidate.programId.toLowerCase() === normalized,
    );
    if (
      !entry ||
      typeof entry.name !== "string" ||
      typeof entry.path !== "string" ||
      !["v1", "v2"].includes(entry.format) ||
      !SAFE_IDL_PATH.test(entry.path)
    ) {
      return null;
    }
    const content = await readFile(resolve(publicRoot, entry.path.slice(1)), "utf8");
    if (Buffer.byteLength(content, "utf8") > MAX_IDL_BYTES) return null;
    return { ...entry, content };
  } catch {
    return null;
  }
}
