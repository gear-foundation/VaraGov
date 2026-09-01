import type { ApiPromise } from "@polkadot/api";
import type { SubmittableExtrinsic } from "@polkadot/api/types";

type SendTx = (tx: SubmittableExtrinsic<"promise">) => Promise<boolean>;
type AnchorStage = "preimage" | "metadata";

export type MetadataAnchorResult =
  | { ok: true; preimage: "existing" | "noted" }
  | { ok: false; stage: "preimage" | "metadata" };

export function hexByteLength(hex: string): number {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(hex)) {
    throw new Error("Metadata preimage must be an even-length hex string.");
  }
  return (hex.length - 2) / 2;
}

export async function anchorReferendumMetadata(
  api: ApiPromise,
  refIndex: number,
  contentHash: string,
  payloadHex: string,
  send: SendTx,
  onStage?: (stage: AnchorStage) => void,
): Promise<MetadataAnchorResult> {
  const length = hexByteLength(payloadHex);
  onStage?.("preimage");
  const stored = (await api.query.preimage.preimageFor([contentHash, length])) as unknown as {
    isSome: boolean;
  };
  let preimage: "existing" | "noted" = "existing";

  if (!stored.isSome) {
    if (!(await send(api.tx.preimage.notePreimage(payloadHex)))) {
      return { ok: false, stage: "preimage" };
    }
    preimage = "noted";
  }

  onStage?.("metadata");
  if (!(await send(api.tx.referenda.setMetadata(refIndex, contentHash)))) {
    return { ok: false, stage: "metadata" };
  }
  return { ok: true, preimage };
}
