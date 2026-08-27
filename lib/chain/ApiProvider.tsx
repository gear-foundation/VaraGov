"use client";

import { ApiPromise, WsProvider } from "@polkadot/api";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Order = priority. WsProvider auto-rotates to the next endpoint on failure.
export const RPC_ENDPOINTS = [
  "wss://rpc.vara.network",
  "wss://archive-rpc.vara-network.io",
  "wss://archive.vara-network.io",
];

export const ARCHIVE_ENDPOINT = "wss://archive-rpc.vara-network.io";

type ApiContextValue = {
  api: ApiPromise | null;
  connected: boolean;
  finalizedNumber: number | null;
};

const ApiContext = createContext<ApiContextValue>({
  api: null,
  connected: false,
  finalizedNumber: null,
});

export function ApiProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<ApiContextValue>({
    api: null,
    connected: false,
    finalizedNumber: null,
  });

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let dead = false;

    const provider = new WsProvider(RPC_ENDPOINTS);
    const api = new ApiPromise({ provider, noInitWarn: true });

    api.on("connected", () =>
      setValue((v) => ({ ...v, connected: true })),
    );
    api.on("disconnected", () =>
      setValue((v) => ({ ...v, connected: false })),
    );

    api.isReady.then(async () => {
      if (dead) return;
      setValue((v) => ({ ...v, api, connected: true }));
      unsub = await api.rpc.chain.subscribeFinalizedHeads((header) => {
        setValue((v) => ({ ...v, finalizedNumber: header.number.toNumber() }));
      });
    });

    return () => {
      dead = true;
      unsub?.();
      api.disconnect().catch(() => {});
    };
  }, []);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi() {
  return useContext(ApiContext);
}
