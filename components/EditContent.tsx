"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/chain/ApiProvider";
import { useWallet } from "@/lib/chain/wallet";
import { useSendTx, TX_LABEL } from "@/lib/chain/tx";
import { signAndPost, type RefContent } from "@/lib/content";
import { MAX_TITLE } from "@/lib/sima";
import { ONGOING_PHASES, type Referendum } from "@/lib/chain/referenda";
import { anchorReferendumMetadata } from "@/lib/chain/metadata";

// Proposer-only editor for title + markdown description.
// Flow: sign SIMA message -> POST -> note exact payload preimage -> optional metadata anchor.
export function EditContent({
  referendum,
  existing,
  onClose,
}: {
  referendum: Referendum;
  existing: RefContent;
  onClose: () => void;
}) {
  const { api } = useApi();
  const { account } = useWallet();
  const queryClient = useQueryClient();
  const { status: txStatus, send } = useSendTx();

  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.contentMd ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHash, setSavedHash] = useState<string | null>(null);
  const [savedPayloadHex, setSavedPayloadHex] = useState<string | null>(null);

  const canAnchor =
    savedHash !== null &&
    savedPayloadHex !== null &&
    ONGOING_PHASES.includes(referendum.phase) &&
    !!api?.tx.referenda.setMetadata &&
    !!api?.tx.preimage.notePreimage;

  async function save() {
    if (!account || !title.trim()) return;
    setBusy(true);
    setError(null);
    const result = await signAndPost(
      "/api/content",
      {
        action: "provide_context",
        network: "vara",
        refIndex: referendum.index,
        title: title.trim(),
        content,
        timestamp: Date.now(),
      },
      account,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedHash(result.contentHash ?? null);
    setSavedPayloadHex(result.payloadHex);
    await queryClient.invalidateQueries({ queryKey: ["content", referendum.index] });
    await queryClient.invalidateQueries({ queryKey: ["titles"] });
  }

  async function anchor() {
    if (!api || !savedHash || !savedPayloadHex) return;
    const result = await anchorReferendumMetadata(
      api,
      referendum.index,
      savedHash,
      savedPayloadHex,
      send,
    );
    if (!result.ok) {
      setError(
        result.stage === "preimage"
          ? "Registering the signed description preimage failed."
          : "Setting referendum metadata failed.",
      );
    }
  }

  return (
    <div
      className="overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit referendum description"
    >
      <div
        className="modal anim-pop max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">
            {existing?.title ? "Edit" : "Add"} title &amp; description · #
            {referendum.index}
          </h2>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost h-8 w-8 !p-0 text-muted">
            <X size={15} />
          </button>
        </div>

        {savedHash === null ? (
          <>
            <label className="mb-1 block text-xs text-muted" htmlFor="ref-title">
              Title (max {MAX_TITLE} chars)
            </label>
            <input
              id="ref-title"
              value={title}
              maxLength={MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              className="input mb-3"
            />
            <label className="mb-1 block text-xs text-muted" htmlFor="ref-content">
              Description (markdown)
            </label>
            <textarea
              id="ref-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              maxLength={8000}
              placeholder={"## Motivation\n\n## Description\n\n## Budget breakdown (if any)"}
              className="input resize-y font-mono"
            />
            {error && <p className="mt-2 text-sm text-nay">{error}</p>}
            <button
              onClick={() => void save()}
              disabled={busy || !title.trim() || !account}
              className="btn btn-primary mt-3 w-full"
            >
              {busy ? "Signing…" : "Sign & save"}
            </button>
            <p className="mt-2 text-xs text-muted">
              Saved off-chain as a wallet-signed message; only the on-chain
              proposer is accepted by the server.
            </p>
          </>
        ) : (
          <div>
            <p className="text-sm text-aye">Saved ✓</p>
            {canAnchor ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  Optionally register the exact signed description as an on-chain
                  preimage, then anchor its hash via <code>referenda.setMetadata</code>.
                  The preimage requires a refundable deposit:
                </p>
                <p className="tnum mt-1 break-all text-xs text-muted">{savedHash}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => void anchor()}
                    disabled={txStatus.state === "signing" || txStatus.state === "broadcast"}
                    className="btn btn-soft"
                  >
                    {txStatus.state === "idle" || txStatus.state === "error"
                      ? "Anchor on chain"
                      : TX_LABEL[txStatus.state]}
                  </button>
                  <button
                    onClick={onClose}
                    className="btn btn-ghost"
                  >
                    {txStatus.state === "finalized" ? "Done" : "Skip"}
                  </button>
                </div>
                {txStatus.state === "error" && (
                  <p className="mt-2 text-sm text-nay">{txStatus.message}</p>
                )}
                {error && txStatus.state !== "error" && (
                  <p className="mt-2 text-sm text-nay">{error}</p>
                )}
                {txStatus.state === "finalized" && (
                  <p className="mt-2 text-sm text-aye">Anchored ✓</p>
                )}
              </>
            ) : (
              <button
                onClick={onClose}
                className="btn btn-ghost mt-3"
              >
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
