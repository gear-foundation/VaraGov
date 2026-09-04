import { compactFromU8aLim, hexToU8a, u8aToString } from "@polkadot/util";
import type {
  DecodedCallNode,
  DecodedCallValue,
  SailsMessageInfo,
} from "./call-decoder";
import { isDecodedCallNode } from "./call-decoder";
import type { ProgramIdlEntry } from "./idl-registry";

type IdlResolver = (programId: string) => Promise<ProgramIdlEntry | null>;
type HexString = `0x${string}`;
type DecodeResponse = Pick<
  SailsMessageInfo,
  "programName" | "service" | "method" | "docs" | "args" | "decoded"
>;

const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;
const ROUTE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function argString(node: DecodedCallNode, name: string): string | null {
  const value = node.args.find((arg) => arg.name === name)?.value;
  return typeof value === "string" ? value : null;
}

function legacyRoute(payload: HexString): { service: string; method: string } | null {
  try {
    const bytes = hexToU8a(payload);
    const [serviceOffset, serviceLength] = compactFromU8aLim(bytes);
    const methodStart = serviceOffset + serviceLength;
    const [methodOffset, methodLength] = compactFromU8aLim(bytes.subarray(methodStart));
    const service = u8aToString(bytes.subarray(serviceOffset, methodStart));
    const method = u8aToString(
      bytes.subarray(methodStart + methodOffset, methodStart + methodOffset + methodLength),
    );
    if (!ROUTE_NAME.test(service) || !ROUTE_NAME.test(method)) return null;
    return { service, method };
  } catch {
    return null;
  }
}

async function requestDecode(
  destination: string,
  payload: HexString,
): Promise<DecodeResponse | null> {
  try {
    const response = await fetch("/api/sails/decode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ programId: destination, payload }),
    });
    if (!response.ok) return null;
    return (await response.json()) as DecodeResponse;
  } catch {
    return null;
  }
}

async function sailsInfo(
  node: DecodedCallNode,
  resolveIdl: IdlResolver,
): Promise<SailsMessageInfo | null> {
  if (node.section !== "gear" || node.method !== "sendMessage") return null;
  const destination = argString(node, "destination");
  const payload = argString(node, "payload");
  if (!destination || !payload || !HEX.test(payload)) return null;
  const hexPayload = payload as HexString;
  const entry = await resolveIdl(destination);

  if (entry) {
    const decoded = await requestDecode(destination, hexPayload);
    if (decoded) return { destination, payload, ...decoded, idlStatus: "decoded" };
    return {
      destination,
      payload,
      programName: entry.name,
      service: null,
      method: null,
      docs: null,
      args: null,
      decoded: null,
      idlStatus: "invalid",
    };
  }

  const route = legacyRoute(hexPayload);
  return {
    destination,
    payload,
    programName: null,
    service: route?.service ?? null,
    method: route?.method ?? null,
    docs: null,
    args: null,
    decoded: null,
    idlStatus: "missing",
  };
}

async function walkValue(value: DecodedCallValue, resolveIdl: IdlResolver): Promise<void> {
  if (isDecodedCallNode(value)) {
    await enrichSailsMessages(value, resolveIdl);
    return;
  }
  if (Array.isArray(value)) {
    await Promise.all(value.map((item) => walkValue(item, resolveIdl)));
    return;
  }
  if (value && typeof value === "object") {
    await Promise.all(Object.values(value).map((item) => walkValue(item, resolveIdl)));
  }
}

export async function enrichSailsMessages(
  node: DecodedCallNode,
  resolveIdl: IdlResolver,
): Promise<DecodedCallNode> {
  node.sails = await sailsInfo(node, resolveIdl);
  await Promise.all(node.args.map((arg) => walkValue(arg.value, resolveIdl)));
  return node;
}
