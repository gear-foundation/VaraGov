"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Circle,
  CircleAlert,
  Coins,
  FileText,
  Loader2,
  SquareCode,
  SkipForward,
} from "lucide-react";
import BigNumber from "bignumber.js";
import { BN } from "@polkadot/util";
import { blake2AsHex } from "@polkadot/util-crypto";
import type { SubmittableExtrinsic } from "@polkadot/api/types";
import { useApi } from "@/lib/chain/ApiProvider";
import { useWallet } from "@/lib/chain/wallet";
import { useSendTx, TX_LABEL } from "@/lib/chain/tx";
import { useTracks } from "@/lib/chain/hooks";
import { useVotingBalance } from "@/lib/chain/voting";
import { trackOrigin, type TrackInfo } from "@/lib/chain/tracks";
import {
  DECIMALS,
  blocksToDuration,
  formatVara,
} from "@/lib/chain/format";
import { signAndPost } from "@/lib/content";
import { MAX_TITLE } from "@/lib/sima";

type ProposalType = "text" | "treasury" | "advanced";

const TYPE_CARDS: {
  key: ProposalType;
  icon: typeof FileText;
  name: string;
  blurb: string;
}[] = [
  {
    key: "text",
    icon: FileText,
    name: "Text proposal",
    blurb: "A signal / opinion referendum with no executable code (system.remark).",
  },
  {
    key: "treasury",
    icon: Coins,
    name: "Treasury spend",
    blurb: "Request VARA from the on-chain treasury for a beneficiary address.",
  },
  {
    key: "advanced",
    icon: SquareCode,
    name: "Advanced (raw call)",
    blurb: "Paste hex-encoded call data and pick the track yourself.",
  },
];

// Track auto-suggestion for treasury spends, by amount in VARA.
const SPEND_TRACKS: [number, string][] = [
  [1_000, "small_tipper"],
  [5_000, "big_tipper"],
  [50_000, "small_spender"],
  [500_000, "medium_spender"],
  [5_000_000, "big_spender"],
  [Infinity, "treasurer"],
];

type StepId = "type" | "build" | "content" | "review" | "execute";
const STEPS: { id: StepId; label: string }[] = [
  { id: "type", label: "Type" },
  { id: "build", label: "Details & track" },
  { id: "content", label: "Title & description" },
  { id: "review", label: "Review" },
  { id: "execute", label: "Sign" },
];

type ExecState = "todo" | "active" | "done" | "skipped" | "error";

export default function NewProposalPage() {
  const router = useRouter();
  const { api } = useApi();
  const { account } = useWallet();
  const tracks = useTracks();
  const balance = useVotingBalance(account?.address);
  const { status: txStatus, send } = useSendTx();

  const [step, setStep] = useState<StepId>("type");
  const [ptype, setPtype] = useState<ProposalType | null>(null);
  const [amount, setAmount] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [rawHex, setRawHex] = useState("");
  const [trackName, setTrackName] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [execSteps, setExecSteps] = useState<
    { id: string; label: string; state: ExecState; note?: string }[]
  >([]);
  const [newIndex, setNewIndex] = useState<number | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const suggestedTrackName = useMemo(() => {
    if (ptype === "text") return "general_admin";
    if (ptype === "treasury") {
      const v = new BigNumber(amount || "0");
      for (const [limit, name] of SPEND_TRACKS) if (v.lte(limit)) return name;
    }
    return null;
  }, [ptype, amount]);

  const track: TrackInfo | undefined = useMemo(() => {
    const name = trackName ?? suggestedTrackName;
    return tracks?.find((t) => t.name === name);
  }, [tracks, trackName, suggestedTrackName]);

  // Build the proposal call.
  const call = useMemo((): SubmittableExtrinsic<"promise"> | null => {
    if (!api || !ptype) return null;
    try {
      if (ptype === "text") {
        if (!title.trim()) return null;
        const h = blake2AsHex(`${title}\n${content}`, 256);
        return api.tx.system.remark(`VaraGov:${h}`);
      }
      if (ptype === "treasury") {
        const v = new BigNumber(amount || "0");
        if (v.lte(0) || !beneficiary) return null;
        const planck = new BN(
          v.times(new BigNumber(10).pow(DECIMALS)).toFixed(0, BigNumber.ROUND_DOWN),
        );
        return api.tx.treasury.spendLocal(planck, beneficiary);
      }
      if (ptype === "advanced") {
        if (!rawHex.startsWith("0x") || rawHex.length < 6) return null;
        return api.tx(api.registry.createType("Call", rawHex));
      }
    } catch {
      return null;
    }
    return null;
  }, [api, ptype, title, content, amount, beneficiary, rawHex]);

  const submissionDeposit = api
    ? ((api.consts.referenda.submissionDeposit as unknown as BN) ?? new BN(0))
    : null;

  const callInfo = useMemo(() => {
    if (!call) return null;
    return {
      hex: call.method.toHex(),
      hash: call.method.hash.toHex(),
      len: call.method.encodedLength,
      section: call.method.section,
      method: call.method.method,
      human: JSON.stringify(call.method.toHuman(), null, 1),
    };
  }, [call]);

  const enoughBalance =
    balance !== undefined && submissionDeposit !== null
      ? balance.gt(submissionDeposit)
      : null;

  function setExec(id: string, state: ExecState, note?: string) {
    setExecSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, state, note: note ?? s.note } : s)),
    );
  }

  async function execute() {
    if (!api || !account || !call || !track || !callInfo) return;
    setExecError(null);
    const plan = [
      { id: "preimage", label: "Register preimage (preimage.notePreimage)", state: "todo" as ExecState },
      { id: "submit", label: "Submit referendum (referenda.submit)", state: "todo" as ExecState },
      { id: "sima", label: "Sign title & description (off-chain message)", state: "todo" as ExecState },
      { id: "anchor", label: "Anchor content hash (referenda.setMetadata)", state: "todo" as ExecState },
    ];
    setExecSteps(plan);

    // 1. Preimage — skipped when the exact preimage already exists on chain.
    setExec("preimage", "active");
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const existing: any = await api.query.preimage.preimageFor([
      callInfo.hash,
      callInfo.len,
    ]);
    if (existing.isSome) {
      setExec("preimage", "skipped", "Preimage already on chain");
    } else {
      const ok = await send(api.tx.preimage.notePreimage(callInfo.hex));
      if (!ok) {
        setExec("preimage", "error");
        setExecError("Preimage registration failed or was cancelled.");
        return;
      }
      setExec("preimage", "done");
    }

    // 2. Submit; the referendum index comes from the Submitted event.
    setExec("submit", "active");
    let refIndex: number | null = null;
    const okSubmit = await send(
      api.tx.referenda.submit(
        trackOrigin(track) as any,
        { Lookup: { hash: callInfo.hash, len: callInfo.len } },
        { After: track.minEnactmentPeriod },
      ),
      (result) => {
        for (const { event } of result.events) {
          if (event.section === "referenda" && event.method === "Submitted") {
            refIndex = (event.data[0] as any).toNumber();
          }
        }
      },
    );
    if (!okSubmit || refIndex === null) {
      setExec("submit", "error");
      setExecError(
        okSubmit
          ? "Could not find the Submitted event — check the referenda list."
          : "Referendum submission failed or was cancelled.",
      );
      return;
    }
    setExec("submit", "done", `Referendum #${refIndex}`);
    setNewIndex(refIndex);

    // 3. Off-chain title/description (SIMA signed message).
    setExec("sima", "active");
    const saved = await signAndPost(
      "/api/content",
      {
        action: "provide_context",
        network: "vara",
        refIndex,
        title: title.trim() || `Referendum #${refIndex}`,
        content,
        timestamp: Date.now(),
      },
      account,
    );
    if (!saved.ok) {
      setExec("sima", "error", saved.error);
      setExecError(
        `Referendum #${refIndex} is on chain, but saving the description failed: ${saved.error}. You can add it later from the referendum page.`,
      );
      return;
    }
    setExec("sima", "done");

    // 4. Anchor the content hash on chain.
    setExec("anchor", "active");
    if (saved.contentHash) {
      const okAnchor = await send(
        api.tx.referenda.setMetadata(refIndex, saved.contentHash),
      );
      setExec("anchor", okAnchor ? "done" : "error");
      if (!okAnchor) {
        setExecError(
          "Anchoring failed (the description is still saved). You can retry from the referendum page.",
        );
        return;
      }
    } else {
      setExec("anchor", "skipped");
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="display text-[34px] font-semibold">New proposal</h1>

      <ol className="mt-4 flex gap-1">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={`h-1.5 flex-1 rounded-full ${
              i <= stepIndex ? "bg-accent" : "bg-surface-2"
            }`}
            aria-label={`${s.label}${i === stepIndex ? " (current)" : ""}`}
          />
        ))}
      </ol>
      <p className="mt-2 text-sm text-muted">
        Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex].label}
      </p>

      {!account && (
        <div className="mt-6 panel p-4 text-sm text-muted">
          Connect a wallet (top right) to create a referendum. You can still
          explore the steps.
        </div>
      )}

      {step === "type" && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {TYPE_CARDS.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                setPtype(c.key);
                setTrackName(null);
                setStep("build");
              }}
              className={`card-hover anim-rise rounded-[14px] border p-4 text-left ${
                ptype === c.key ? "border-accent/60 bg-accent-soft/30" : "border-line bg-surface"
              }`}
              style={{ ["--stagger" as string]: `${TYPE_CARDS.indexOf(c) * 60}ms` }}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-soft text-accent-ink">
                <c.icon size={17} strokeWidth={1.75} />
              </span>
              <h3 className="display mt-3 text-[17px] font-medium">{c.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{c.blurb}</p>
            </button>
          ))}
        </div>
      )}

      {step === "build" && ptype && (
        <div className="mt-6 space-y-4">
          {ptype === "treasury" && (
            <div className="panel p-4">
              <label className="mb-1 block text-xs text-muted" htmlFor="amount">
                Amount (VARA)
              </label>
              <input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                placeholder="10000"
                className="input tnum mb-3"
              />
              <label className="mb-1 block text-xs text-muted" htmlFor="beneficiary">
                Beneficiary address (Vara, ss58)
              </label>
              <input
                id="beneficiary"
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value.trim())}
                placeholder="kG…"
                className="input tnum"
              />
            </div>
          )}

          {ptype === "advanced" && (
            <div className="panel p-4">
              <label className="mb-1 block text-xs text-muted" htmlFor="rawhex">
                Call data (hex)
              </label>
              <textarea
                id="rawhex"
                value={rawHex}
                onChange={(e) => setRawHex(e.target.value.trim())}
                rows={3}
                placeholder="0x…"
                className="input tnum font-mono"
              />
              {rawHex && !callInfo && (
                <p className="mt-1 text-xs text-nay">Cannot decode this call data.</p>
              )}
              {callInfo && (
                <p className="mt-1 text-xs text-aye">
                  Decodes to <code>{callInfo.section}.{callInfo.method}</code>
                </p>
              )}
            </div>
          )}

          {ptype === "text" && (
            <p className="panel p-4 text-sm text-muted">
              A text proposal puts a <code>system.remark</code> with the hash of
              your title and description on chain — the referendum expresses an
              opinion and executes nothing.
            </p>
          )}

          <div className="panel p-4">
            <label className="mb-1 block text-xs text-muted" htmlFor="track">
              Track{" "}
              {suggestedTrackName && (trackName ?? suggestedTrackName) === suggestedTrackName
                ? "(auto-suggested)"
                : ""}
            </label>
            <select
              id="track"
              value={trackName ?? suggestedTrackName ?? ""}
              onChange={(e) => setTrackName(e.target.value)}
              className="input"
            >
              <option value="" disabled>
                Select a track
              </option>
              {tracks?.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.displayName}
                </option>
              ))}
            </select>
            {track && (
              <dl className="tnum mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
                <dt>Decision deposit</dt>
                <dd className="text-right text-ink">{formatVara(track.decisionDeposit)} VARA</dd>
                <dt>Prepare period</dt>
                <dd className="text-right">{blocksToDuration(track.preparePeriod)}</dd>
                <dt>Decision period</dt>
                <dd className="text-right">{blocksToDuration(track.decisionPeriod)}</dd>
                <dt>Confirm period</dt>
                <dd className="text-right">{blocksToDuration(track.confirmPeriod)}</dd>
                <dt>Min enactment</dt>
                <dd className="text-right">{blocksToDuration(track.minEnactmentPeriod)}</dd>
              </dl>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep("type")} className="btn btn-ghost">
              <ArrowLeft size={15} /> Back
            </button>
            <button
              onClick={() => setStep("content")}
              disabled={!track || (ptype !== "text" && !callInfo)}
              className="btn btn-primary"
            >
              Continue <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {step === "content" && (
        <div className="mt-6 space-y-4">
          <div className="panel p-4">
            <label className="mb-1 block text-xs text-muted" htmlFor="title">
              Title (max {MAX_TITLE} chars)
            </label>
            <input
              id="title"
              value={title}
              maxLength={MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fund the Vara community hackathon Q4"
              className="input mb-3"
            />
            <label className="mb-1 block text-xs text-muted" htmlFor="content">
              Description (markdown)
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              maxLength={8000}
              placeholder={"## Motivation\n\n## Description\n\n## Budget breakdown (if any)"}
              className="input resize-y font-mono"
            />
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep("build")} className="btn btn-ghost">
              <ArrowLeft size={15} /> Back
            </button>
            <button
              onClick={() => setStep("review")}
              disabled={!title.trim()}
              className="btn btn-primary"
            >
              Continue <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {step === "review" && track && callInfo && (
        <div className="mt-6 space-y-4">
          <div className="panel p-4 text-sm">
            <h3 className="mb-2 font-medium">{title}</h3>
            <p className="text-xs text-muted">
              <code>{callInfo.section}.{callInfo.method}</code> · track{" "}
              {track.displayName}
            </p>
            <pre className="tnum mt-2 max-h-40 overflow-auto rounded-lg bg-surface-2 p-2 text-xs">
              {callInfo.human}
            </pre>
          </div>

          <div className="panel p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted">Costs</h3>
            <dl className="tnum grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted">Submission deposit (refundable)</dt>
              <dd className="text-right">
                {submissionDeposit ? `${formatVara(submissionDeposit)} VARA` : "…"}
              </dd>
              <dt className="text-muted">Preimage deposit (refundable)</dt>
              <dd className="text-right">≈ by size ({callInfo.len} bytes)</dd>
              <dt className="text-muted">Decision deposit (later, anyone)</dt>
              <dd className="text-right">{formatVara(track.decisionDeposit)} VARA</dd>
            </dl>
            <p className="mt-2 text-xs text-muted">
              Without a decision deposit the referendum times out 14 days after
              submission. It can be placed later — by anyone, not only you.
            </p>
            {account && enoughBalance === false && (
              <p className="mt-2 text-sm text-nay">
                Your balance ({balance ? formatVara(balance) : "…"} VARA) is below
                the submission deposit — the transaction would fail.
              </p>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep("content")} className="btn btn-ghost">
              <ArrowLeft size={15} /> Back
            </button>
            <button
              onClick={() => {
                setStep("execute");
                void execute();
              }}
              disabled={!account || enoughBalance === false}
              className="btn btn-primary"
            >
              {account ? "Sign & submit" : "Connect a wallet first"}
            </button>
          </div>
        </div>
      )}

      {step === "execute" && (
        <div className="mt-6 space-y-4">
          <ol className="space-y-2">
            {execSteps.map((s) => (
              <li
                key={s.id}
                className="panel anim-rise flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span aria-hidden className="flex w-5 justify-center">
                  {s.state === "done" && <Check size={16} className="text-aye" />}
                  {s.state === "skipped" && (
                    <SkipForward size={15} className="text-muted" />
                  )}
                  {s.state === "active" && (
                    <Loader2 size={16} className="animate-spin text-accent-ink" />
                  )}
                  {s.state === "todo" && (
                    <Circle size={13} className="text-muted/50" />
                  )}
                  {s.state === "error" && (
                    <CircleAlert size={16} className="text-nay" />
                  )}
                </span>
                <span className={s.state === "todo" ? "text-muted" : ""}>{s.label}</span>
                {s.note && <span className="ml-auto text-xs text-muted">{s.note}</span>}
              </li>
            ))}
          </ol>

          {(txStatus.state === "signing" || txStatus.state === "broadcast") && (
            <p className="text-sm text-muted">{TX_LABEL[txStatus.state]}</p>
          )}
          {execError && <p className="text-sm text-nay">{execError}</p>}

          {newIndex !== null && !execError && execSteps.every((s) => s.state !== "active") && (
            <div className="panel p-4">
              <p className="text-sm text-aye">Referendum #{newIndex} created ✓</p>
              <p className="mt-1 text-xs text-muted">
                Next: place the decision deposit from the referendum page so it can
                enter the deciding period.
              </p>
              <button
                onClick={() => router.push(`/referenda/${newIndex}`)}
                className="btn btn-primary mt-3"
              >
                Open referendum #{newIndex}
              </button>
            </div>
          )}
          {execError && newIndex !== null && (
            <button
              onClick={() => router.push(`/referenda/${newIndex}`)}
              className="btn btn-ghost"
            >
              Open referendum #{newIndex}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
