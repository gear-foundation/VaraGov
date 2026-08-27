"use client";

import type { SubmittableExtrinsic } from "@polkadot/api/types";
import type { ISubmittableResult } from "@polkadot/types/types";
import { useCallback, useState } from "react";
import { useWallet, getSigner } from "./wallet";

export type TxStatus =
  | { state: "idle" }
  | { state: "signing" }
  | { state: "broadcast" }
  | { state: "inBlock"; blockHash: string }
  | { state: "finalized"; blockHash: string }
  | { state: "error"; message: string };

// Wraps signAndSend with the 4 UI states every write action must expose.
export function useSendTx() {
  const { account } = useWallet();
  const [status, setStatus] = useState<TxStatus>({ state: "idle" });

  const send = useCallback(
    async (
      tx: SubmittableExtrinsic<"promise">,
      onInBlock?: (result: ISubmittableResult) => void,
    ): Promise<boolean> => {
      if (!account) {
        setStatus({ state: "error", message: "Connect a wallet first." });
        return false;
      }
      setStatus({ state: "signing" });
      try {
        const signer = await getSigner(account);
        return await new Promise<boolean>((resolve) => {
          tx.signAndSend(
            account.address,
            { signer },
            (result: ISubmittableResult) => {
              if (result.status.isBroadcast) {
                setStatus({ state: "broadcast" });
              } else if (result.status.isInBlock) {
                const failed = result.events.find(({ event }) =>
                  event.section === "system" && event.method === "ExtrinsicFailed",
                );
                if (failed) {
                  setStatus({
                    state: "error",
                    message: "Transaction failed on chain (ExtrinsicFailed).",
                  });
                  resolve(false);
                  return;
                }
                setStatus({
                  state: "inBlock",
                  blockHash: result.status.asInBlock.toHex(),
                });
                onInBlock?.(result);
              } else if (result.status.isFinalized) {
                setStatus({
                  state: "finalized",
                  blockHash: result.status.asFinalized.toHex(),
                });
                resolve(true);
              } else if (result.isError) {
                setStatus({ state: "error", message: "Transaction error." });
                resolve(false);
              }
            },
          ).catch((e: Error) => {
            // User cancelled in the extension or signing failed.
            setStatus({ state: "error", message: e.message });
            resolve(false);
          });
        });
      } catch (e) {
        setStatus({ state: "error", message: (e as Error).message });
        return false;
      }
    },
    [account],
  );

  const reset = useCallback(() => setStatus({ state: "idle" }), []);
  return { status, send, reset };
}

export const TX_LABEL: Record<TxStatus["state"], string> = {
  idle: "",
  signing: "Waiting for signature…",
  broadcast: "Broadcasting…",
  inBlock: "In block",
  finalized: "Finalized",
  error: "Error",
};
