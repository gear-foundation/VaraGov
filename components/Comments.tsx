"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/lib/chain/wallet";
import { useComments, signAndPost, type CommentDto } from "@/lib/content";
import { shortAddress } from "@/lib/chain/format";
import { Markdown } from "./Markdown";

function CommentItem({
  c,
  onReply,
}: {
  c: CommentDto;
  onReply: (id: string) => void;
}) {
  return (
    <div className="panel !rounded-[12px] p-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted">
        <span className="tnum font-medium text-ink" title={c.author}>
          {shortAddress(c.author)}
        </span>
        <span>
          {new Date(c.createdAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {c.editedAt && <span>(edited)</span>}
        <button
          onClick={() => onReply(c.id)}
          className="ml-auto hover:text-ink"
        >
          Reply
        </button>
      </div>
      <Markdown>{c.contentMd}</Markdown>
    </div>
  );
}

export function Comments({ refIndex }: { refIndex: number }) {
  const { account } = useWallet();
  const { data: comments, isPending } = useComments(refIndex);
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roots = comments?.filter((c) => !c.replyToId) ?? [];
  const replies = (id: string) =>
    comments?.filter((c) => c.replyToId === id) ?? [];

  async function post() {
    if (!account || !text.trim()) return;
    setBusy(true);
    setError(null);
    const result = await signAndPost(
      `/api/comments/${refIndex}`,
      {
        action: "comment",
        network: "vara",
        refIndex,
        content: text.trim(),
        ...(replyTo ? { replyTo } : {}),
        timestamp: Date.now(),
      },
      account,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setText("");
    setReplyTo(null);
    await queryClient.invalidateQueries({ queryKey: ["comments", refIndex] });
  }

  return (
    <section className="mt-6">
      <h2 className="label-serif mb-3">
        Comments{comments ? ` · ${comments.length}` : ""}
      </h2>

      {isPending ? (
        <div className="skeleton h-16" />
      ) : roots.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line p-4 text-sm text-muted">
          No comments yet. Be the first.
        </p>
      ) : (
        <div className="space-y-3">
          {roots.map((c) => (
            <div key={c.id}>
              <CommentItem c={c} onReply={setReplyTo} />
              {replies(c.id).length > 0 && (
                <div className="ml-6 mt-2 space-y-2">
                  {replies(c.id).map((r) => (
                    <CommentItem key={r.id} c={r} onReply={setReplyTo} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="panel mt-4 p-3">
        {replyTo && (
          <p className="mb-2 text-xs text-muted">
            Replying to a comment ·{" "}
            <button onClick={() => setReplyTo(null)} className="text-nay hover:underline">
              cancel
            </button>
          </p>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={8000}
          placeholder={
            account
              ? "Write a comment (markdown supported). It will be signed with your wallet."
              : "Connect a wallet to comment."
          }
          disabled={!account || busy}
          className="input resize-y disabled:opacity-60"
        />
        {error && <p className="mt-1 text-sm text-nay">{error}</p>}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted">
            Signed message · requires a funded account
          </span>
          <button
            onClick={() => void post()}
            disabled={!account || busy || !text.trim()}
            className="btn btn-soft"
          >
            {busy ? "Signing…" : "Post comment"}
          </button>
        </div>
      </div>
    </section>
  );
}
