import assert from "node:assert/strict";
import test from "node:test";

import {
  humanizeTxError,
  isTxPending,
  type TxStatus,
} from "../lib/chain/tx";
import {
  humanizeApiError,
  humanizeHttpError,
  humanizeReadError,
  humanizeTxStatus,
} from "../lib/chain/errors";

test("a transaction remains pending until it is finalized", () => {
  const states: TxStatus[] = [
    { state: "idle" },
    { state: "signing" },
    { state: "broadcast" },
    { state: "inBlock", blockHash: "0x01" },
    { state: "finalized", blockHash: "0x02" },
    { state: "error", message: "failed" },
  ];

  assert.deepEqual(states.map(isTxPending), [false, true, true, true, false, false]);
});

test("fee-payment RPC errors are translated into an actionable message", () => {
  assert.equal(
    humanizeTxError(
      new Error(
        "1010: Invalid Transaction: Inability to pay some fees, e.g. account balance too low",
      ),
    ),
    "There is not enough transferable VARA to pay the network fee. Reduce the transaction amount or top up the account, then try again.",
  );
});

test("wallet rejection errors do not leak provider wording", () => {
  assert.equal(
    humanizeTxError(new Error("Rejected by user: code 4001")),
    "The request was rejected in the wallet. No changes were made.",
  );
});

test("network and stale errors are translated into recovery steps", () => {
  assert.equal(
    humanizeTxError(new Error("WebSocket disconnected")),
    "The app lost its connection to Vara Network. Check your connection and try again.",
  );
  assert.equal(
    humanizeTxError(new Error("1010: Invalid Transaction: Stale")),
    "This transaction is outdated. Refresh the page and try again.",
  );
});

test("known runtime errors use product language", () => {
  assert.equal(
    humanizeTxError(new Error("referenda.NotOngoing: referendum is not ongoing")),
    "This referendum is no longer ongoing, so this action cannot be completed.",
  );
  assert.equal(
    humanizeTxError(new Error("fellowshipCollective.NotMember: account is not a member")),
    "This account is not a Fellowship member and cannot vote on Fellowship referenda.",
  );
  assert.equal(
    humanizeTxError(new Error("fellowshipCollective.RankTooLow: rank is too low")),
    "This Fellowship account does not have the rank required to vote on this referendum.",
  );
});

test("unknown transaction errors never expose raw provider text", () => {
  assert.equal(
    humanizeTxError(new Error("opaque provider stack trace")),
    "Something went wrong. Please try again.",
  );
  assert.equal(
    humanizeTxError(new Error("balances.SomeNewError")),
    "The network rejected this action (balances.SomeNewError). Review the entered values and try again.",
  );
});

test("read failures name the data and provide a recovery step", () => {
  assert.equal(
    humanizeReadError("comments"),
    "Could not load comments. Check your connection and try again.",
  );
});

test("terminal transaction statuses explain what happened", () => {
  assert.equal(
    humanizeTxStatus("Usurped"),
    "A newer transaction from this account replaced this one.",
  );
  assert.equal(
    humanizeTxStatus("FinalityTimeout"),
    "The transaction was submitted but was not finalized in time. Check the account before retrying.",
  );
});

test("less common Substrate validation errors remain actionable", () => {
  assert.equal(
    humanizeTxError(new Error("1010: Invalid Transaction: Future")),
    "This account has an earlier transaction still pending. Wait for it to finish, then try again.",
  );
  assert.equal(
    humanizeTxError(new Error("Invalid Transaction: BadProof")),
    "The network could not verify the wallet signature. Reconnect the wallet and try again.",
  );
  assert.equal(
    humanizeTxError(new Error("Invalid Transaction: ExhaustsResources")),
    "The network cannot fit this transaction into a block right now. Wait a moment and try again.",
  );
});

test("signed API errors hide protocol field names", () => {
  assert.equal(
    humanizeApiError("payloadJson, address and signature are required.", 400),
    "The signed request is invalid. Refresh the page and try again.",
  );
  assert.equal(
    humanizeApiError("Signature verification failed.", 400),
    "The wallet signature could not be verified. Check the selected account and try again.",
  );
  assert.equal(
    humanizeApiError(undefined, 500),
    "The server could not complete the request. Please try again shortly.",
  );
  assert.equal(
    humanizeApiError("Prisma P2024 pool timeout at db.internal", 500),
    "The server could not complete the request. Please try again shortly.",
  );
  assert.equal(
    humanizeHttpError(),
    "Could not reach the app server. Check your connection and try again.",
  );
});
