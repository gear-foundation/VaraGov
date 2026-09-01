import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../lib/generated/prisma/client";
import {
  lockCommentAuthor,
  lockReferendumContent,
} from "../lib/server/advisory-lock";

function transactionRecorder() {
  const calls: { sql: string; values: unknown[] }[] = [];
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join("?"), values });
      return 1;
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

test("comment author lock is executed without deserializing PostgreSQL void", async () => {
  const { tx, calls } = transactionRecorder();

  await lockCommentAuthor(tx, "kG-test-address");

  assert.deepEqual(calls, [
    {
      sql: "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
      values: ["kG-test-address"],
    },
  ]);
});

test("referendum content lock uses the numeric referendum index", async () => {
  const { tx, calls } = transactionRecorder();

  await lockReferendumContent(tx, 77);

  assert.deepEqual(calls, [
    {
      sql: "SELECT pg_advisory_xact_lock(?)",
      values: [77],
    },
  ]);
});
