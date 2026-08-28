"use client";

import type { SubmittableExtrinsic } from "@polkadot/api/types";
import type { ISubmittableResult } from "@polkadot/types/types";
import type { DispatchError } from "@polkadot/types/interfaces";
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
          let unsubscribe: (() => void) | undefined;
          let settled = false;
          const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            unsubscribe?.();
            resolve(ok);
          };
          tx.signAndSend(
            account.address,
            { signer },
            (result: ISubmittableResult) => {
              if (settled) return;
              if (result.status.isBroadcast) {
                setStatus({ state: "broadcast" });
              } else if (result.status.isInBlock) {
                const failed = result.events.find(({ event }) =>
                  event.section === "system" && event.method === "ExtrinsicFailed",
                );
                if (failed) {
                  const dispatchError = failed.event.data[0] as unknown as DispatchError;
                  let message = "Transaction failed on chain.";
                  if (dispatchError?.isModule) {
                    const decoded = tx.registry.findMetaError(dispatchError.asModule);
                    message = `${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}`;
                  }
                  setStatus({
                    state: "error",
                    message,
                  });
                  finish(false);
                  return;
                }
                setStatus({
                  state: "inBlock",
                  blockHash: result.status.asInBlock.toHex(),
                });
                try {
                  onInBlock?.(result);
                } catch (error) {
                  setStatus({ state: "error", message: (error as Error).message });
                  finish(false);
                }
              } else if (result.status.isFinalized) {
                setStatus({
                  state: "finalized",
                  blockHash: result.status.asFinalized.toHex(),
                });
                finish(true);
              } else if (
                result.isError ||
                result.status.isDropped ||
                result.status.isInvalid ||
                result.status.isUsurped ||
                result.status.isFinalityTimeout
              ) {
                setStatus({
                  state: "error",
                  message: `Transaction ${result.status.type.toLowerCase()}.`,
                });
                finish(false);
              }
            },
          )
            .then((stop) => {
              unsubscribe = stop;
              if (settled) stop();
            })
            .catch((e: Error) => {
              // User cancelled in the extension or signing failed.
              setStatus({ state: "error", message: e.message });
              finish(false);
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
