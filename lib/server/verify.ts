import { blake2AsHex, signatureVerify } from "@polkadot/util-crypto";
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

export function verifySimaMessage(body: unknown): VerifiedMessage | { error: string } {
  const { payloadJson, address, signature } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof payloadJson !== "string" ||
    typeof address !== "string" ||
    typeof signature !== "string"
  ) {
    return { error: "payloadJson, address and signature are required." };
  }
  if (payloadJson.length > MAX_CONTENT + 1024) {
    return { error: `Message too large (max ${MAX_CONTENT} bytes of content).` };
  }

  let payload: SimaPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { error: "payloadJson is not valid JSON." };
  }
  if (payload.network !== "vara") return { error: "Wrong network." };
  if (!Number.isInteger(payload.refIndex) || payload.refIndex < 0) {
    return { error: "Invalid refIndex." };
  }
  if (
    typeof payload.timestamp !== "number" ||
    Math.abs(Date.now() - payload.timestamp) > TIMESTAMP_WINDOW_MS
  ) {
    return { error: "Message timestamp is too old or in the future — re-sign it." };
  }
  if (payload.title !== undefined && payload.title.length > MAX_TITLE) {
    return { error: `Title too long (max ${MAX_TITLE} chars).` };
  }
  if (payload.content !== undefined && payload.content.length > MAX_CONTENT) {
    return { error: `Content too long (max ${MAX_CONTENT} bytes).` };
  }

  // Extensions sign raw bytes wrapped in <Bytes>…</Bytes>; accept both forms.
  const raw = stringToU8a(payloadJson);
  const ok =
    signatureVerify(u8aWrapBytes(raw), signature, address).isValid ||
    signatureVerify(raw, signature, address).isValid;
  if (!ok) return { error: "Signature verification failed." };

  return {
    payload,
    payloadJson,
    address,
    signature,
    contentHash: blake2AsHex(payloadJson, 256),
  };
}
