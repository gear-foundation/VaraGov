import { hexToU8a } from "@polkadot/util";

export type DecodedCallValue =
  | null
  | boolean
  | number
  | string
  | DecodedCallValue[]
  | { [key: string]: DecodedCallValue }
  | DecodedCallNode;

export type DecodedCallArg = {
  name: string;
  type: string;
  value: DecodedCallValue;
};

export type SailsMessageInfo = {
  destination: string;
  payload: string;
  programName: string | null;
  service: string | null;
  method: string | null;
  docs: string | null;
  args: DecodedCallArg[] | null;
  decoded: DecodedCallValue | null;
  idlStatus: "missing" | "decoded" | "invalid";
};

export type DecodedCallNode = {
  kind: "call";
  callIndex: string;
  section: string;
  method: string;
  docs: string | null;
  args: DecodedCallArg[];
  sails: SailsMessageInfo | null;
};

type Stringable = { toString(): string };
type MetaCall = {
  section: string;
  method: string;
  meta: {
    args: Iterable<{ name: Stringable; type: Stringable }>;
    docs: Iterable<Stringable>;
  };
};
export type CallRegistry = {
  findMetaCall(callIndex: Uint8Array): MetaCall;
};

type DecodeContext = { nodes: number; maxNodes: number; maxDepth: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCallJson(value: unknown): value is Record<string, unknown> & {
  callIndex: string;
  args?: unknown;
} {
  return (
    isRecord(value) &&
    typeof value.callIndex === "string" &&
    /^0x[0-9a-fA-F]{4}$/.test(value.callIndex)
  );
}

function decodeValue(
  registry: CallRegistry,
  value: unknown,
  context: DecodeContext,
  depth: number,
): DecodedCallValue {
  if (depth > context.maxDepth || context.nodes >= context.maxNodes) {
    return "[truncated]";
  }
  context.nodes += 1;

  if (isCallJson(value)) return decodeCall(registry, value, context, depth);
  if (Array.isArray(value)) {
    return value.map((item) => decodeValue(registry, item, context, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        decodeValue(registry, item, context, depth + 1),
      ]),
    );
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
}

function decodeCall(
  registry: CallRegistry,
  value: Record<string, unknown> & { callIndex: string; args?: unknown },
  context: DecodeContext,
  depth: number,
): DecodedCallNode {
  let metadata: MetaCall | null = null;
  try {
    metadata = registry.findMetaCall(hexToU8a(value.callIndex));
  } catch {
    // Preserve unknown calls as data instead of failing the whole proposal tree.
  }

  const rawArgRecord = isRecord(value.args) ? value.args : {};
  const rawArgs = Object.entries(rawArgRecord);
  const metaArgs = metadata ? Array.from(metadata.meta.args) : [];
  const args: DecodedCallArg[] = [];

  for (const metaArg of metaArgs) {
    const name = metaArg.name.toString();
    args.push({
      name,
      type: metaArg.type.toString(),
      value: decodeValue(registry, rawArgRecord[name] ?? null, context, depth + 1),
    });
  }
  const knownNames = new Set(metaArgs.map((arg) => arg.name.toString()));
  for (const [name, rawValue] of rawArgs) {
    if (knownNames.has(name)) continue;
    args.push({
      name,
      type: "Unknown",
      value: decodeValue(registry, rawValue, context, depth + 1),
    });
  }

  const docs = metadata
    ? Array.from(metadata.meta.docs, (line) => line.toString().trim())
        .filter(Boolean)
        .join(" ")
    : "";

  return {
    kind: "call",
    callIndex: value.callIndex,
    section: metadata?.section ?? "unknown",
    method: metadata?.method ?? value.callIndex,
    docs: docs || null,
    args,
    sails: null,
  };
}

export function decodeCallTree(
  registry: CallRegistry,
  value: unknown,
  limits: { maxNodes?: number; maxDepth?: number } = {},
): DecodedCallNode {
  if (!isCallJson(value)) throw new Error("Proposal is not a runtime Call");
  return decodeCall(
    registry,
    value,
    {
      nodes: 0,
      maxNodes: limits.maxNodes ?? 2_000,
      maxDepth: limits.maxDepth ?? 24,
    },
    0,
  );
}

export function isDecodedCallNode(value: DecodedCallValue): value is DecodedCallNode {
  return isRecord(value) && value.kind === "call";
}

export function callTreeToJson(node: DecodedCallNode): Record<string, unknown> {
  const convert = (value: DecodedCallValue): unknown => {
    if (isDecodedCallNode(value)) return callTreeToJson(value);
    if (Array.isArray(value)) return value.map(convert);
    if (isRecord(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convert(item)]));
    }
    return value;
  };

  return {
    callIndex: node.callIndex,
    section: node.section,
    method: node.method,
    args: Object.fromEntries(node.args.map((arg) => [arg.name, convert(arg.value)])),
    ...(node.sails
      ? {
          sails: {
            destination: node.sails.destination,
            programName: node.sails.programName,
            service: node.sails.service,
            method: node.sails.method,
            docs: node.sails.docs,
            decoded: node.sails.decoded,
            idlStatus: node.sails.idlStatus,
          },
        }
      : {}),
  };
}
