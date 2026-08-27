"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Wallet, X, Check } from "lucide-react";
import { useWallet } from "@/lib/chain/wallet";
import { shortAddress } from "@/lib/chain/format";

export function WalletButton() {
  const { status, accounts, account, connect, select, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Portal target exists only after mount (SSR renders no document).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          if (status === "idle") void connect();
        }}
        className={`btn h-9 ${account ? "btn-ghost" : "btn-soft"}`}
      >
        <Wallet size={15} />
        <span className="hidden max-w-28 truncate sm:inline">
          {account
            ? account.meta.name || shortAddress(account.address)
            : status === "loading"
              ? "Connecting…"
              : "Connect"}
        </span>
      </button>

      {/* Portaled to <body>: the header's backdrop-filter creates a containing
          block that would trap position:fixed and pin the dialog to the top. */}
      {open &&
        mounted &&
        createPortal(
          <div
            className="overlay"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Wallet connection"
          >
          <div
            className="modal anim-pop w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold tracking-tight">Wallet</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="btn btn-ghost h-8 w-8 !p-0 text-muted"
              >
                <X size={15} />
              </button>
            </div>

            {status === "loading" && (
              <div className="space-y-2" aria-busy="true">
                <div className="skeleton h-12" />
                <div className="skeleton h-12" />
              </div>
            )}

            {status === "no-extension" && (
              <div className="text-sm text-muted">
                <p>
                  No Vara-compatible wallet extension found. Install one, then
                  reload this page:
                </p>
                <ul className="mt-2 list-disc pl-5">
                  <li>SubWallet</li>
                  <li>Talisman</li>
                  <li>polkadot.js extension</li>
                </ul>
              </div>
            )}

            {status === "no-account" && (
              <p className="text-sm text-muted">
                The extension is installed but has no accounts, or access was
                denied. Create/allow an account in the extension and try again.
              </p>
            )}

            {(status === "idle" || status === "no-extension") && (
              <button
                onClick={() => void connect()}
                className="btn btn-soft mt-4 w-full"
              >
                {status === "idle" ? "Connect" : "Retry"}
              </button>
            )}

            {status === "ready" && (
              <div className="space-y-1.5">
                {accounts.map((a) => {
                  const selected = account?.address === a.address;
                  return (
                    <button
                      key={a.address}
                      onClick={() => {
                        select(a.address);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                        selected
                          ? "border-accent/50 bg-accent-soft/40"
                          : "border-line hover:border-line-strong hover:bg-surface-2"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {a.meta.name || "Unnamed"}
                        </span>
                        <span className="tnum text-xs text-muted">
                          {shortAddress(a.address)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {a.meta.source}
                      </span>
                      {selected && (
                        <Check size={15} className="shrink-0 text-accent-ink" />
                      )}
                    </button>
                  );
                })}
                {account && (
                  <button
                    onClick={() => {
                      disconnect();
                      setOpen(false);
                    }}
                    className="btn btn-ghost mt-2 w-full text-muted hover:!text-nay"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            )}
          </div>
          </div>,
          document.body,
        )}
    </>
  );
}
