import {
  blake2AsHex,
  decodeAddress,
  encodeAddress,
  signatureVerify,
} from "@polkadot/util-crypto";
import { stringToU8a, u8aWrapBytes } from "@polkadot/util";
import {
  MAX_CONTENT,
  MAX_TITLE,
  TIMESTAMP_WINDOW_MS,
  type SimaPayload,
} from "../sima";

export type VerifiedMessage = {
  payload: SimaPayload;
  payloadJson: string;
  address: string;
  signature: string;
  contentHash: string; // blake2_256 of the signed string — for referenda.setMetadata
};

const ACTIONS = new Set(["provide_context", "comment", "edit_comment"]);

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function verifySimaMessage(body: unknown): VerifiedMessage | { error: string } {
  const { payloadJson, address, signature } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof payloadJson !== "string" ||
    typeof address !== "string" ||
    typeof signature !== "string"
  ) {
    return { error: "payloadJson, address and signature are required." };
  }
  if (address.length > 128 || signature.length > 512) {
    return { error: "Invalid address or signature." };
  }
  if (byteLength(payloadJson) > MAX_CONTENT + 1024) {
    return { error: `Message too large (max ${MAX_CONTENT} bytes of content).` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return { error: "payloadJson is not valid JSON." };
  }
  if (!isObject(parsed)) return { error: "payloadJson must contain an object." };
  const payload = parsed as SimaPayload;
  if (!ACTIONS.has(payload.action)) return { error: "Invalid action." };
  if (payload.network !== "vara") return { error: "Wrong network." };
  if (!Number.isSafeInteger(payload.refIndex) || payload.refIndex < 0) {
    return { error: "Invalid refIndex." };
  }
  if (
    typeof payload.timestamp !== "number" ||
    !Number.isSafeInteger(payload.timestamp) ||
    Math.abs(Date.now() - payload.timestamp) > TIMESTAMP_WINDOW_MS
  ) {
    return { error: "Message timestamp is too old or in the future — re-sign it." };
  }
  if (payload.title !== undefined && typeof payload.title !== "string") {
    return { error: "Title must be a string." };
  }
  if (payload.content !== undefined && typeof payload.content !== "string") {
    return { error: "Content must be a string." };
  }
  if (payload.replyTo !== undefined && typeof payload.replyTo !== "string") {
    return { error: "replyTo must be a string." };
  }
  if (payload.commentId !== undefined && typeof payload.commentId !== "string") {
    return { error: "commentId must be a string." };
  }
  if (payload.title !== undefined && Array.from(payload.title).length > MAX_TITLE) {
    return { error: `Title too long (max ${MAX_TITLE} chars).` };
  }
  if (payload.content !== undefined && byteLength(payload.content) > MAX_CONTENT) {
    return { error: `Content too long (max ${MAX_CONTENT} bytes).` };
  }

  // Extensions sign raw bytes wrapped in <Bytes>…</Bytes>; accept both forms.
  const raw = stringToU8a(payloadJson);
  let ok = false;
  let canonicalAddress: string;
  try {
    canonicalAddress = encodeAddress(decodeAddress(address), 137);
    ok =
      signatureVerify(u8aWrapBytes(raw), signature, address).isValid ||
      signatureVerify(raw, signature, address).isValid;
  } catch {
    return { error: "Invalid address or signature." };
  }
  if (!ok) return { error: "Signature verification failed." };

  return {
    payload,
    payloadJson,
    address: canonicalAddress,
    signature,
    contentHash: blake2AsHex(payloadJson, 256),
  };
}
