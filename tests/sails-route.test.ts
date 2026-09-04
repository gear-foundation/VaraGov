import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/sails/decode/route";

test("Sails decode route rejects malformed input", async () => {
  const response = await POST(
    new Request("http://localhost/api/sails/decode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ programId: "wrong", payload: "0x00" }),
    }),
  );

  assert.equal(response.status, 400);
});

test("Sails decode route returns not found for an unregistered program", async () => {
  const response = await POST(
    new Request("http://localhost/api/sails/decode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ programId: `0x${"11".repeat(32)}`, payload: "0x00" }),
    }),
  );

  assert.equal(response.status, 404);
});

test("Sails decode route rejects a declared oversized body before parsing", async () => {
  const response = await POST(
    new Request("http://localhost/api/sails/decode", {
      method: "POST",
      headers: { "content-length": "300000", "content-type": "application/json" },
      body: "{}",
    }),
  );

  assert.equal(response.status, 413);
});
