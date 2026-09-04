/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DecodedCallArg, DecodedCallValue } from "../chain/call-decoder";
import type { ProgramIdl } from "../chain/idl-registry";

type HexString = `0x${string}`;
const parsedV1 = new Map<string, Promise<any>>();
const parsedV2 = new Map<string, Promise<any>>();

export type DecodedSailsPayload = {
  programName: string;
  service: string;
  method: string;
  docs: string | null;
  args: DecodedCallArg[];
  decoded: DecodedCallValue;
};

function jsonSafe(value: any): DecodedCallValue {
  const candidate = value?.toHuman?.() ?? value?.toJSON?.() ?? value;
  const serialized = JSON.stringify(candidate, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
  return serialized === undefined
    ? String(candidate)
    : (JSON.parse(serialized) as DecodedCallValue);
}

function displayType(value: any): string {
  if (typeof value === "string") return value;
  const serialized = JSON.stringify(value);
  return serialized && serialized !== "{}" ? serialized : String(value);
}

function typedArgs(fn: any, decoded: DecodedCallValue): DecodedCallArg[] {
  const record = decoded && typeof decoded === "object" && !Array.isArray(decoded)
    ? decoded as Record<string, DecodedCallValue>
    : {};
  return fn.args.map((arg: any) => ({
    name: arg.name,
    type: displayType(arg.type),
    value: record[arg.name] ?? null,
  }));
}

function cacheKey(idl: ProgramIdl): string {
  return `${idl.programId.toLowerCase()}:${idl.content.length}`;
}

function getV2Program(idl: ProgramIdl): Promise<any> {
  const key = cacheKey(idl);
  let pending = parsedV2.get(key);
  if (!pending) {
    pending = Promise.all([import("sails-js"), import("sails-js/parser")]).then(
      async ([{ SailsProgram }, { SailsIdlParser }]) => {
        const parser = new SailsIdlParser();
        await parser.init();
        return new SailsProgram(parser.parse(idl.content));
      },
    );
    parsedV2.set(key, pending);
  }
  return pending;
}

function getV1Program(idl: ProgramIdl): Promise<any> {
  const key = cacheKey(idl);
  let pending = parsedV1.get(key);
  if (!pending) {
    pending = Promise.all([import("sails-js"), import("sails-js-parser")]).then(
      async ([{ Sails }, { SailsIdlParser }]) => {
        const parser = await SailsIdlParser.new();
        return new Sails(parser).parseIdl(idl.content);
      },
    );
    parsedV1.set(key, pending);
  }
  return pending;
}

export async function decodeSailsPayload(
  idl: ProgramIdl,
  payload: HexString,
): Promise<DecodedSailsPayload> {
  if (idl.format === "v2") {
    const program = await getV2Program(idl);
    const call = program.decodeCall(payload);
    if (call.kind === "unknown" || call.entry.kind === "event" || call.entry.kind === "ctor") {
      throw new Error("Payload is not a known Sails call");
    }
    const service = call.entry.service;
    const method = call.entry.fn;
    const fn =
      program.services[service]?.functions[method] ??
      program.services[service]?.queries[method];
    if (!fn) throw new Error("Function is absent from IDL");
    const decoded = jsonSafe(call.args);
    return {
      programName: idl.name,
      service,
      method,
      docs: fn.docs?.trim() || null,
      args: typedArgs(fn, decoded),
      decoded,
    };
  }

  const program = await getV1Program(idl);
  const { getFnNamePrefix, getServiceNamePrefix } = await import("sails-js");
  const service = getServiceNamePrefix(payload);
  const method = getFnNamePrefix(payload);
  const fn =
    program.services[service]?.functions[method] ??
    program.services[service]?.queries[method];
  if (!fn) throw new Error("Function is absent from IDL");
  const decoded = jsonSafe(fn.decodePayload(payload));
  return {
    programName: idl.name,
    service,
    method,
    docs: fn.docs?.trim() || null,
    args: typedArgs(fn, decoded),
    decoded,
  };
}
