import assert from "node:assert/strict";
import test from "node:test";
import { u8aToHex } from "@polkadot/util";
import {
  callTreeToJson,
  decodeCallTree,
  isDecodedCallNode,
  type CallRegistry,
} from "../lib/chain/call-decoder";
import { enrichSailsMessages } from "../lib/chain/sails-decoder";
import { decodeSailsPayload } from "../lib/server/sails-decoder";

const metadata = {
  "0x0802": {
    section: "utility",
    method: "batchAll",
    docs: ["Execute all calls atomically."],
    args: [{ name: "calls", type: "Vec<Call>" }],
  },
  "0x6803": {
    section: "gear",
    method: "sendMessage",
    docs: ["Send a message to a program."],
    args: [
      { name: "destination", type: "ActorId" },
      { name: "payload", type: "Bytes" },
    ],
  },
} as const;

const registry: CallRegistry = {
  findMetaCall(callIndex) {
    const entry = metadata[u8aToHex(callIndex) as keyof typeof metadata];
    if (!entry) throw new Error("Unknown call");
    return {
      section: entry.section,
      method: entry.method,
      meta: {
        docs: entry.docs.map((value) => ({ toString: () => value })),
        args: entry.args.map((arg) => ({
          name: { toString: () => arg.name },
          type: { toString: () => arg.type },
        })),
      },
    };
  },
};

test("resolves nested runtime call indexes with names, types and docs", () => {
  const root = decodeCallTree(registry, {
    callIndex: "0x0802",
    args: {
      calls: [
        {
          callIndex: "0x6803",
          args: { destination: "0x1234", payload: "0xabcd" },
        },
      ],
    },
  });

  assert.equal(root.section, "utility");
  assert.equal(root.method, "batchAll");
  assert.equal(root.docs, "Execute all calls atomically.");
  assert.equal(root.args[0].type, "Vec<Call>");

  const calls = root.args[0].value;
  assert.ok(Array.isArray(calls));
  assert.ok(isDecodedCallNode(calls[0]));
  assert.equal(calls[0].section, "gear");
  assert.equal(calls[0].method, "sendMessage");
  assert.equal(calls[0].args[1].type, "Bytes");

  assert.deepEqual(callTreeToJson(root), {
    callIndex: "0x0802",
    section: "utility",
    method: "batchAll",
    args: {
      calls: [
        {
          callIndex: "0x6803",
          section: "gear",
          method: "sendMessage",
          args: { destination: "0x1234", payload: "0xabcd" },
        },
      ],
    },
  });
});

test("matches runtime argument metadata by name instead of JSON property order", () => {
  const root = decodeCallTree(registry, {
    callIndex: "0x6803",
    args: { payload: "0xabcd", destination: "0x1234" },
  });

  assert.equal(root.args[0].name, "destination");
  assert.equal(root.args[0].type, "ActorId");
  assert.equal(root.args[0].value, "0x1234");
  assert.equal(root.args[1].name, "payload");
  assert.equal(root.args[1].type, "Bytes");
  assert.equal(root.args[1].value, "0xabcd");
});

test("keeps an unknown call visible instead of failing the whole tree", () => {
  const root = decodeCallTree(registry, {
    callIndex: "0xffff",
    args: { value: 7 },
  });

  assert.equal(root.section, "unknown");
  assert.equal(root.method, "0xffff");
  assert.deepEqual(root.args, [{ name: "value", type: "Unknown", value: 7 }]);
});

test("rejects values that are not runtime calls", () => {
  assert.throws(() => decodeCallTree(registry, { args: {} }), /not a runtime Call/);
});

test("recognizes a Sails service and function in gear.sendMessage payload", async () => {
  const root = decodeCallTree(registry, {
    callIndex: "0x6803",
    args: {
      destination: `0x${"11".repeat(32)}`,
      payload:
        "0x285666744d616e61676572285570646174655666747304dbf80fe5bd78b44510",
    },
  });

  await enrichSailsMessages(root, async () => null);

  assert.equal(root.sails?.service, "VftManager");
  assert.equal(root.sails?.method, "UpdateVfts");
  assert.equal(root.sails?.idlStatus, "missing");
});

test("decodes Sails v2 route and typed arguments with a registered IDL", async () => {
  const idl = `
!@sails: 2.0.0

service Counter@0x6548ac581acb5450 {
  functions {
    /// Add a value to the counter.
    Add(value: u32) -> u32;
  }
}

program CounterTest {
  services {
    Counter@0x6548ac581acb5450,
  }
}`;
  const [{ SailsProgram }, { SailsIdlParser }] = await Promise.all([
    import("sails-js"),
    import("sails-js/parser"),
  ]);
  const parser = new SailsIdlParser();
  await parser.init();
  const program = new SailsProgram(parser.parse(idl));
  const payload = program.services.Counter.functions.Add.encodePayload(42);
  const destination = `0x${"22".repeat(32)}`;
  const decoded = await decodeSailsPayload(
    {
      programId: destination,
      name: "Counter test program",
      format: "v2",
      path: "/idl/programs/counter.idl",
      content: idl,
    },
    payload,
  );

  assert.equal(decoded.programName, "Counter test program");
  assert.equal(decoded.service, "Counter");
  assert.equal(decoded.method, "Add");
  assert.equal(decoded.args[0].name, "value");
  assert.equal(decoded.args[0].type, "u32");
  assert.equal(decoded.args[0].value, 42);
});
