export type IdlFormat = "v1" | "v2";

export type ProgramIdlEntry = {
  programId: string;
  name: string;
  format: IdlFormat;
  path: string;
};

export type ProgramIdl = ProgramIdlEntry & { content: string };

type Manifest = {
  version: 1;
  programs: ProgramIdlEntry[];
};

const PROGRAM_ID = /^0x[0-9a-fA-F]{64}$/;
const SAFE_IDL_PATH = /^\/idl\/programs\/(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+\.idl$/;
let manifestPromise: Promise<Manifest | null> | null = null;

function loadManifest(): Promise<Manifest | null> {
  manifestPromise ??= fetch("/idl/manifest.json")
    .then(async (response) => {
      if (!response.ok) return null;
      const value = (await response.json()) as Partial<Manifest>;
      if (value.version !== 1 || !Array.isArray(value.programs)) return null;
      return value as Manifest;
    })
    .catch(() => null);
  return manifestPromise;
}

export async function resolveProgramIdlEntry(
  programId: string,
): Promise<ProgramIdlEntry | null> {
  const normalized = programId.toLowerCase();
  if (!PROGRAM_ID.test(normalized)) return null;
  try {
    const manifest = await loadManifest();
    const entry = manifest?.programs.find(
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

    return entry;
  } catch {
    return null;
  }
}
