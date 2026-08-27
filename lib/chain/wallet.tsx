"use client";

import type { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { SS58_PREFIX } from "./format";

// Wallet readiness is a 4-state machine, never a single "not ready" flag:
export type WalletStatus =
  | "idle" // extensions not yet enabled (user hasn't clicked Connect)
  | "loading"
  | "no-extension"
  | "no-account"
  | "ready";

type WalletContextValue = {
  status: WalletStatus;
  accounts: InjectedAccountWithMeta[];
  account: InjectedAccountWithMeta | null;
  connect: () => Promise<void>;
  select: (address: string) => void;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue>({
  status: "idle",
  accounts: [],
  account: null,
  connect: async () => {},
  select: () => {},
  disconnect: () => {},
});

const LS_KEY = "varagov.account";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [accounts, setAccounts] = useState<InjectedAccountWithMeta[]>([]);
  const [account, setAccount] = useState<InjectedAccountWithMeta | null>(null);

  const connect = useCallback(async () => {
    setStatus("loading");
    try {
      const { web3Enable, web3Accounts } = await import(
        "@polkadot/extension-dapp"
      );
      const injected = await web3Enable("VaraGov");
      if (injected.length === 0) {
        setStatus("no-extension");
        return;
      }
      const accs = await web3Accounts({ ss58Format: SS58_PREFIX });
      setAccounts(accs);
      if (accs.length === 0) {
        setStatus("no-account");
        return;
      }
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(LS_KEY);
      } catch {}
      const preselected = accs.find((a) => a.address === saved);
      if (preselected) setAccount(preselected);
      setStatus("ready");
    } catch {
      setStatus("no-extension");
    }
  }, []);

  // Silent reconnect if the user connected before.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LS_KEY);
    } catch {}
    // One-shot silent reconnect; connect() flips status to "loading" synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) void connect();
  }, [connect]);

  const select = useCallback(
    (address: string) => {
      const acc = accounts.find((a) => a.address === address) ?? null;
      setAccount(acc);
      try {
        if (acc) localStorage.setItem(LS_KEY, acc.address);
      } catch {}
    },
    [accounts],
  );

  const disconnect = useCallback(() => {
    setAccount(null);
    setAccounts([]);
    setStatus("idle");
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
  }, []);

  return (
    <WalletContext.Provider
      value={{ status, accounts, account, connect, select, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}

export async function getSigner(account: InjectedAccountWithMeta) {
  const { web3FromSource } = await import("@polkadot/extension-dapp");
  const injector = await web3FromSource(account.meta.source);
  return injector.signer;
}
