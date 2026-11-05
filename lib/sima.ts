// SIMA-style signed off-chain content: every write is a standalone
// wallet-signed JSON message. No sessions, no cookies.
// The client signs the EXACT JSON string it sends (payloadJson), so
// canonicalization is never an issue: verify the string, then parse it.

export type SimaAction = "provide_context" | "comment" | "edit_comment";
export type GovernanceKind = "token" | "fellowship";

export function payloadGovernance(payload: { governance?: GovernanceKind }): GovernanceKind {
  return payload.governance ?? "token";
}

export type SimaPayload = {
  action: SimaAction;
  network: "vara";
  governance?: GovernanceKind; // absent in legacy token-holder messages
  refIndex: number;
  title?: string;
  content?: string;
  replyTo?: string;
  commentId?: string; // edit_comment target
  timestamp: number; // ms epoch
};

export const MAX_TITLE = 120;
export const MAX_CONTENT = 8 * 1024;
export const TIMESTAMP_WINDOW_MS = 10 * 60 * 1000;

export function buildPayloadJson(payload: SimaPayload): string {
  return JSON.stringify(payload);
}
