"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Landmark,
  Wallet,
  Circle,
  CircleAlert,
  Coins,
  FileText,
  Loader2,
  SquareCode,
  SkipForward,
} from "lucide-react";
import { ExplorerAccount, LedgerAmount, Money, QuoteSource, amountUsd, freshQuote, useVaraPrice, type Quote } from "@/components/TreasuryValues";
import { useTreasury } from "@/lib/chain/treasury-hooks";
import { nativeSpend, selectSpendTrack, proposalSummary } from "@/lib/chain/treasury";
import { decodeCallTree, type CallRegistry } from "@/lib/chain/call-decoder";
import BigNumber from "bignumber.js";
import { BN } from "@polkadot/util";
import { blake2AsHex } from "@polkadot/util-crypto";
import type { SubmittableExtrinsic } from "@polkadot/api/types";
import { useApi } from "@/lib/chain/ApiProvider";
import { useWallet } from "@/lib/chain/wallet";
import { isTxPending, useSendTx, TX_LABEL } from "@/lib/chain/tx";
import { useTracksQuery } from "@/lib/chain/hooks";
import { useVotingBalanceQuery } from "@/lib/chain/voting";
import { trackOrigin, type TrackInfo } from "@/lib/chain/tracks";
import {
  blocksToDuration,
  DECIMALS,
  formatVara,
} from "@/lib/chain/format";
import { signAndPost } from "@/lib/content";
import { anchorReferendumMetadata } from "@/lib/chain/metadata";
import { Seal } from "@/components/Seal";
import { MAX_CONTENT, MAX_TITLE } from "@/lib/sima";
import { humanizeReadError, humanizeTxError } from "@/lib/chain/errors";
import { ErrorNotice } from "@/components/ErrorNotice";
import { parseVaraAmount } from "@/lib/chain/amount";

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
    blurb: "Ask token holders to vote on a question or a public statement.",
  },
  {
    key: "treasury",
    icon: Coins,
    name: "Treasury spend",
    blurb: "Request VARA for a community project or infrastructure.",
  },
  {
    key: "advanced",
    icon: SquareCode,
    name: "Advanced (raw call)",
    blurb: "Submit an encoded runtime call and choose its governance track.",
  },
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

export default function ProposalWizard({ startWithTreasury }: { startWithTreasury: boolean }) {
  const router = useRouter();
  const { api, connected, error: apiError } = useApi();
  const { account } = useWallet();
  const {
    data: tracks,
    error: tracksError,
    refetch: refetchTracks,
  } = useTracksQuery();
  const {
    data: balance,
    error: balanceError,
    refetch: refetchBalance,
  } = useVotingBalanceQuery(account?.address);
  const { status: txStatus, send } = useSendTx();

  const [step, setStep] = useState<StepId>(startWithTreasury ? "build" : "type");
  const [ptype, setPtype] = useState<ProposalType | null>(startWithTreasury ? "treasury" : null);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"VARA" | "USD">("VARA");
  const [purpose, setPurpose] = useState<"project" | "infrastructure">("project");
  const [application, setApplication] = useState({ team: "", use: "", milestones: "", reporting: "", discussion: "" });
  const livePrice = freshQuote(useVaraPrice());
  const [reviewQuote, setReviewQuote] = useState<Quote>();
  const price = step === "review" || step === "execute" ? reviewQuote : livePrice;
  const { data: treasury, isError: treasuryError, refetch: reloadTreasury } = useTreasury(ptype === "treasury");
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
  const parsedTreasuryAmount = useMemo(() => {
    if (unit === "VARA") return parseVaraAmount(amount);
    if (!price) return { ok: false, message: "A recent VARA/USD quote is required for USD input." } as const;
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !new BigNumber(amount).gt(0)) {
      return { ok: false, message: "Enter a positive USD amount with up to two decimals." } as const;
    }
    return parseVaraAmount(new BigNumber(amount).shiftedBy(DECIMALS).idiv(price.usd).shiftedBy(-DECIMALS).toFixed());
  }, [unit, amount, price]);
  const limits = treasury?.specVersion === api?.runtimeVersion.specVersion.toNumber() ? treasury?.limits : null;
  const treasuryTrack = parsedTreasuryAmount.ok && tracks && limits
    ? selectSpendTrack(purpose === "infrastructure" ? tracks.filter((t) => t.name === "treasurer") : tracks,
        limits, parsedTreasuryAmount.planck)
    : undefined;
  const track: TrackInfo | undefined = ptype === "treasury" ? treasuryTrack
    : tracks?.find((t) => t.name === (trackName ?? (ptype === "text" ? "general_admin" : null)));
  const suggestedTrackName = ptype === "treasury" ? treasuryTrack?.name : ptype === "text" ? "general_admin" : null;
  const amountPlanck = parsedTreasuryAmount.ok ? parsedTreasuryAmount.planck.toString() : null;
  const grantMarkdown = amountPlanck ? [
    `**Requested amount:** ${new BigNumber(amountPlanck).shiftedBy(-DECIMALS).toFixed()} VARA`,
    `**Beneficiary:** ${beneficiary}`,
    `**Application type:** ${purpose}`,
    "## Team", application.team,
    "## Use of funds", application.use,
    "## Milestones", application.milestones,
    "## Reporting", application.reporting,
    ...(application.discussion.trim() ? ["## Discussion", application.discussion.trim()] : []),
  ].join("\n\n") : "";
  const effectiveContent = ptype === "treasury" ? grantMarkdown : content;
  const projectOverLimit = purpose === "project" && price && amountPlanck && amountUsd(amountPlanck, price).gt(10_000);

  // Build the proposal call.
  const call = useMemo((): SubmittableExtrinsic<"promise"> | null => {
    if (!api || !ptype) return null;
    try {
      if (ptype === "text") {
        if (!title.trim()) return null;
        const h = blake2AsHex(`${title.trim()}\n${content}`, 256);
        return api.tx.system.remark(`VaraGov:${h}`);
      }
      if (ptype === "treasury") {
        if (!parsedTreasuryAmount.ok || !beneficiary) return null;
        return nativeSpend(api, parsedTreasuryAmount.planck, beneficiary);
      }
      if (ptype === "advanced") {
        if (!rawHex.startsWith("0x") || rawHex.length < 6) return null;
        return api.tx(api.registry.createType("Call", rawHex));
      }
    } catch {
      return null;
    }
    return null;
  }, [api, ptype, title, content, parsedTreasuryAmount, beneficiary, rawHex]);

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

  const { data: costs, isError: costError, refetch: reloadCosts } = useQuery({
    queryKey: ["proposal-costs", account?.address, callInfo?.hash, track?.id, api?.runtimeVersion.specVersion.toString()],
    enabled: step === "review" && !!api && connected && !!account && !!callInfo && !!track,
    queryFn: async () => {
      if (!api || !account || !callInfo || !track) throw new Error("Proposal unavailable");
      const hash = await api.rpc.chain.getFinalizedHead();
      const at = await api.at(hash);
      const accountData = (await at.query.system.account(account.address)).data;
      const preimage = await at.query.preimage.preimageFor([callInfo.hash, callInfo.len]);
      const exists = !preimage.isEmpty;
      const note = api.tx.preimage.notePreimage(callInfo.hex);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const submit = api.tx.referenda.submit(trackOrigin(track) as any,
        { Lookup: { hash: callInfo.hash, len: callInfo.len } }, { After: track.minEnactmentPeriod });
      const [submission, noteFee] = await Promise.all([
        submit.paymentInfo(account.address),
        exists ? null : note.paymentInfo(account.address),
      ]);
      const free = accountData.free.toBn();
      const frozen = accountData.frozen.toBn().sub(accountData.reserved.toBn());
      const deposit = at.consts.balances.existentialDeposit.toBn();
      const available = free.sub(BN.max(frozen, deposit));
      // The runtime's preimage consideration is not exposed as a constant.
      // Published v2.1.1 pricing: 150 VARA + 1.5 VARA per byte.
      const preimageDeposit = exists ? new BN(0) : api.runtimeVersion.specVersion.eqn(20101)
        ? new BN(150_000_000_000_000).add(new BN(1_500_000_000_000).muln(callInfo.len)) : null;
      const fees = submission.partialFee.toBn().add(noteFee?.partialFee.toBn() ?? new BN(0));
      return { available, preimageDeposit, fees };
    },
  });
  const enoughBalance = costs && submissionDeposit
    ? costs.available.gte(submissionDeposit.add(costs.preimageDeposit ?? new BN(0)).add(costs.fees))
    : balance !== undefined && submissionDeposit !== null && ptype !== "treasury"
      ? balance.gt(submissionDeposit) : null;

  const buildValidationMessage = useMemo(() => {
    if (!ptype) return "Choose a proposal type.";
    if (ptype === "treasury") {
      if (!parsedTreasuryAmount.ok) return parsedTreasuryAmount.message;
      if (!beneficiary) return "Enter the beneficiary's Vara address.";
      if (!callInfo) return "Enter a valid Vara beneficiary address.";
      if (!limits) return "Spend limits are unavailable for the connected runtime.";
      if (!track) return "This amount exceeds the available treasury track limit.";
    }
    if (ptype === "advanced") {
      if (!rawHex) return "Paste the 0x-prefixed call data.";
      if (!callInfo || !call || !api) return "Enter valid call data that can be decoded by Vara.";
      const summary = proposalSummary(decodeCallTree(api.registry as unknown as CallRegistry, call.method.toJSON()));
      if (summary.blockedTreasuryCall) {
        return "Treasury proposals must use spend without a delayed payout date.";
      }
    }
    if (!track) return "Select a governance track.";
    return null;
  }, [ptype, track, limits, parsedTreasuryAmount, beneficiary, rawHex, callInfo, call, api]);

  function setExec(id: string, state: ExecState, note?: string) {
    setExecSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, state, note: note ?? s.note } : s)),
    );
  }

  async function execute() {
    if (!api || !connected || !account || !call || !track || !callInfo) return;
    if (buildValidationMessage || (ptype === "treasury" && unit === "USD" && !freshQuote(price))) {
      setExecError("The proposal needs a fresh review before signing.");
      return;
    }
    setExecError(null);
    const plan = [
      { id: "preimage", label: "Register preimage (preimage.notePreimage)", state: "todo" as ExecState },
      { id: "submit", label: "Submit referendum (referenda.submit)", state: "todo" as ExecState },
      { id: "sima", label: "Sign title & description (off-chain message)", state: "todo" as ExecState },
      { id: "metadata-preimage", label: "Register description preimage", state: "todo" as ExecState },
      { id: "anchor", label: "Anchor content hash (referenda.setMetadata)", state: "todo" as ExecState },
    ];
    setExecSteps(plan);

    try {
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
          setExecError("Preimage registration was not completed.");
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
            ? "The referendum was submitted, but its number could not be read. Check the referenda list before retrying."
            : "Referendum submission was not completed.",
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
          content: effectiveContent,
          timestamp: Date.now(),
        },
        account,
      );
      if (!saved.ok) {
        setExec("sima", "error", saved.error);
        setExecError(
          `Referendum #${refIndex} is on chain, but its description was not saved: ${saved.error} You can add it later from the referendum page.`,
        );
        return;
      }
      setExec("sima", "done");

      // 4–5. Store the exact signed payload as a preimage, then anchor its hash.
      if (saved.contentHash) {
        const anchored = await anchorReferendumMetadata(
          api,
          refIndex,
          saved.contentHash,
          saved.payloadHex,
          send,
          (stage) => {
            if (stage === "preimage") setExec("metadata-preimage", "active");
            else {
              setExec("metadata-preimage", "done");
              setExec("anchor", "active");
            }
          },
        );
        setExec(
          "metadata-preimage",
          anchored.ok || anchored.stage === "metadata" ? "done" : "error",
          anchored.ok && anchored.preimage === "existing"
            ? "Already on chain"
            : undefined,
        );
        setExec(
          "anchor",
          anchored.ok ? "done" : anchored.stage === "metadata" ? "error" : "todo",
        );
        if (!anchored.ok) {
          setExecError(
            anchored.stage === "preimage"
              ? "The description is saved, but its on-chain preimage was not registered. You can retry from the referendum page."
              : "The description is saved, but its hash was not anchored on chain. You can retry from the referendum page.",
          );
          return;
        }
      } else {
        setExec("metadata-preimage", "skipped");
        setExec("anchor", "skipped");
      }
    } catch (error) {
      setExecSteps((current) =>
        current.map((item) =>
          item.state === "active" ? { ...item, state: "error" } : item,
        ),
      );
      setExecError(humanizeTxError(error));
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      previousStep.current = step;
      stepTitle.current?.focus();
      stepTitle.current?.scrollIntoView({ block: "center" });
    }
  }, [step]);
  const heading = ptype === "treasury" && step !== "type" ? "Request treasury funding" : "New proposal";
  const contentIssue = !title.trim() ? "Enter a title to continue."
    : new TextEncoder().encode(effectiveContent).length > MAX_CONTENT ? "Shorten the application before continuing."
    : ptype === "treasury" && [application.team, application.use, application.milestones, application.reporting].some((field) => !field.trim())
      ? "Complete the team, use of funds, milestones and reporting fields." : null;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="rule-double pb-5">
        {ptype === "treasury" && <Link className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink" href="/treasury">
          <Landmark size={14} aria-hidden /> Community treasury
        </Link>}
        <h1 className="display text-balance text-4xl font-semibold leading-tight sm:text-5xl">{heading}</h1>
      </header>

      <ol aria-label="Proposal progress" className="mt-5 grid grid-cols-5 gap-1 sm:gap-2">
        {STEPS.map((item, index) => (
          <li key={item.id} aria-current={index === stepIndex ? "step" : undefined}
            className={`min-w-0 border-t-2 pt-2 ${index <= stepIndex ? "border-accent-ink/65" : "border-line"}`}>
            <span className={`flex items-center gap-1 whitespace-nowrap text-[10px] font-medium sm:text-xs ${index === stepIndex ? "text-accent-ink" : "text-muted"}`}>
              {index < stepIndex && <Check size={13} className="hidden shrink-0 sm:block" aria-hidden />}
              {["Type", "Details", "Content", "Review", "Sign"][index]}
            </span>
          </li>
        ))}
      </ol>
      <h2 ref={stepTitle} tabIndex={-1} className="display mt-5 scroll-mt-24 text-2xl font-semibold outline-none">
        {step === "type" ? "Choose a proposal type" : STEPS[stepIndex].label}
      </h2>

      {!account && (step === "type" || step === "review") && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Wallet size={16} className="shrink-0" aria-hidden /> A wallet is required when you’re ready to sign.
        </p>
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
              className={`panel row-hover anim-rise flex flex-col items-start p-4 text-left ${
                ptype === c.key ? "border-accent/60 bg-accent-soft/30" : "border-line bg-surface"
              }`}
              style={{ ["--stagger" as string]: `${TYPE_CARDS.indexOf(c) * 60}ms` }}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-soft text-accent-ink">
                <c.icon size={17} strokeWidth={1.75} />
              </span>
              <span className="display mt-3 flex items-center gap-1 text-lg font-semibold">{c.name}<ChevronRight size={14} className="shrink-0 text-accent-ink" aria-hidden /></span>
              <p className="mt-1 text-xs leading-relaxed text-muted">{c.blurb}</p>
            </button>
          ))}
        </div>
      )}

      {step === "build" && ptype && (
        <div className="mt-6 space-y-4">
          {tracksError && (
            <ErrorNotice
              message={humanizeReadError("governance tracks")}
              onRetry={() => void refetchTracks()}
            />
          )}
          {ptype === "treasury" && (
            <div className="panel p-5">
              <div className="mb-4">
                <h3 className="label-serif">Funding request</h3>
                <p className="mt-1 text-sm text-muted">Enter the amount and the Vara address that would receive it.</p>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <label className="text-xs text-muted">Application type
                  <select className="input mt-1" value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)}>
                    <option value="project">Project grant</option><option value="infrastructure">Infrastructure</option>
                  </select>
                </label>
                <label className="text-xs text-muted">Amount in
                  <select className="input mt-1" value={unit} onChange={(e) => { setUnit(e.target.value as typeof unit); setAmount(""); }}>
                    <option>VARA</option><option disabled={!price}>USD</option>
                  </select>
                </label>
              </div>
              {treasuryError && <ErrorNotice message="Treasury parameters are unavailable." onRetry={() => void reloadTreasury()} />}
              <label className="mb-1 block text-xs text-muted" htmlFor="amount">
                Amount ({unit})
              </label>
              <input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                placeholder="10000"
                className={`input tnum mb-1 ${
                  amount.trim() && !parsedTreasuryAmount.ok ? "!border-nay" : ""
                }`}
              />
              {amount.trim() && !parsedTreasuryAmount.ok && (
                <p className="mb-3 text-xs text-nay">{parsedTreasuryAmount.message}</p>
              )}
              {amountPlanck && <p className="mb-2 text-xs"><Money amount={amountPlanck} quote={price} /></p>}
              <div className="mt-2"><QuoteSource quote={price} /></div>
              {projectOverLimit && <p className="my-2 text-sm text-warn">This exceeds the $10,000 project grant guideline.</p>}
              <label className="mt-3 mb-1 block text-xs text-muted" htmlFor="beneficiary">
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

          <div className="panel p-5">
            {ptype === "treasury" ? <div aria-live="polite">
              <h3 className="label-serif">Governance track</h3>
              <p className="display mt-1 text-xl font-semibold">{track?.displayName ?? "Track pending"}</p>
              <p className="mt-1 text-sm text-muted">{track ? "Selected automatically for this request." : "Enter a valid amount to see the track and its deposit."}</p>
            </div> : <>
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
            </>}
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
              disabled={buildValidationMessage !== null}
              className="btn btn-primary"
            >
              Continue <ChevronRight size={15} />
            </button>
          </div>
          {buildValidationMessage && (
            <p aria-live="polite" className="text-right text-xs text-muted">{buildValidationMessage}</p>
          )}
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
            {ptype === "treasury" ? <div className="space-y-3">
              {([
                ["team", "Team"], ["use", "Use of funds"], ["milestones", "Milestones"],
                ["reporting", "Reporting"], ["discussion", "Discussion link (optional)"],
              ] as const).map(([key, label]) => <label key={key} className="block text-xs text-muted">
                {label}
                <textarea className="input mt-1" rows={key === "discussion" ? 1 : 2} maxLength={1200}
                  value={application[key]} onChange={(e) => setApplication({ ...application, [key]: e.target.value })} />
              </label>)}
            </div> : <>
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
            </>}
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep("build")} className="btn btn-ghost">
              <ArrowLeft size={15} /> Back
            </button>
            <button
              onClick={() => { setReviewQuote(livePrice); setStep("review"); }}
              disabled={contentIssue !== null}
              className="btn btn-primary"
            >
              Continue <ChevronRight size={15} />
            </button>
          </div>
          {contentIssue && <p className="text-right text-xs text-muted">{contentIssue}</p>}
        </div>
      )}

      {step === "review" && track && callInfo && (
        <div className="mt-6 space-y-4">
          {balanceError && (
            <ErrorNotice
              message={humanizeReadError("your account balance")}
              onRetry={() => void refetchBalance()}
            />
          )}
          {apiError && !connected && <ErrorNotice message={apiError} />}
          <div className="panel p-4 text-sm">
            <h3 className="display mb-3 text-xl font-semibold">{title.trim()}</h3>
            {ptype === "treasury" && amountPlanck && <div className="mb-3 space-y-1">
              <div className="mb-3 grid gap-3 rounded-md border border-line bg-surface-2 p-3 sm:grid-cols-2">
                <div><p className="label-serif">Request</p><LedgerAmount amount={amountPlanck} quote={price} className="text-2xl" /></div>
                <div className="min-w-0"><p className="label-serif">Recipient</p><p className="mt-1"><ExplorerAccount address={beneficiary} /></p></div>
              </div>
              <QuoteSource quote={price} />
              {projectOverLimit && <p className="text-warn">This exceeds the $10,000 project grant guideline.</p>}
              {treasury?.support[track.name] && <p>Minimum support at the end of the decision period · <Money amount={treasury.support[track.name]} quote={price} /></p>}
              {treasury && BigInt(treasury.remaining) < BigInt(amountPlanck) && <p className="text-warn">Current liquid funds after commitments are below this request. A reliable payout date requires a pool withdrawal or another receipt.</p>}
              <p className="text-muted">Earliest enactment after the decision deposit and a free track slot · {treasury?.clock.msPerBlock
                ? blocksToDuration((track.preparePeriod + track.confirmPeriod + track.minEnactmentPeriod) * treasury.clock.msPerBlock / 3000)
                : "date unavailable"}. Payment also depends on available funds and a payout transaction.</p>
            </div>}
            <p className="mt-3 text-sm">Track · <strong>{track.displayName}</strong></p>
            <details open={ptype === "advanced" ? true : undefined} className="group mt-3 border-t border-line pt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted [&::-webkit-details-marker]:hidden">
                <ChevronDown size={15} className="group-open:rotate-180" aria-hidden /> Review runtime call
              </summary>
              <pre className="tnum mt-2 max-h-40 overflow-auto rounded-md bg-surface-2 p-3 text-xs">{callInfo.human}</pre>
            </details>
          </div>

          <div className="panel p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted">Costs</h3>
            {costError && <ErrorNotice compact message="Could not estimate submission fees." onRetry={() => void reloadCosts()} />}
            <dl className="tnum grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted">Submission deposit (refundable)</dt>
              <dd className="text-right">
                {submissionDeposit ? `${formatVara(submissionDeposit)} VARA` : "…"}
              </dd>
              <dt className="text-muted">Preimage deposit (refundable)</dt>
              <dd className="text-right">{costs?.preimageDeposit
                ? <Money amount={costs.preimageDeposit.toString()} quote={price} />
                : `By size (${callInfo.len} bytes) · amount unavailable`}</dd>
              {costs && <><dt className="text-muted">Estimated submission fees</dt><dd className="text-right"><Money amount={costs.fees.toString()} quote={price} /></dd></>}
              <dt className="text-muted">Decision deposit (later, anyone)</dt>
              <dd className="text-right">{formatVara(track.decisionDeposit)} VARA</dd>
            </dl>
            <p className="mt-2 text-xs text-muted">
              Anyone can place the decision deposit before the chain deadline. The chain can slash it if the referendum is killed. Anchoring the description requires a separate preimage deposit and network fees.
            </p>
            {account && enoughBalance === false && (
              <p className="mt-2 text-sm text-nay">
                Your balance ({balance ? formatVara(balance) : "…"} VARA) is below
                the estimated requirement to submit.
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
              disabled={!account || !connected || enoughBalance !== true || buildValidationMessage !== null}
              className="btn btn-primary"
            >
              {!account
                ? "Connect a wallet first"
                : !connected
                  ? "Vara Network is unavailable"
                : enoughBalance === null
                  ? "Checking balance…"
                  : "Sign & submit"}
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

          {isTxPending(txStatus) && (
            <p className="text-sm text-muted">{TX_LABEL[txStatus.state]}</p>
          )}
          {txStatus.state === "error" ? (
            <ErrorNotice message={txStatus.message} compact />
          ) : execError ? (
            <ErrorNotice message={execError} compact />
          ) : null}

          {newIndex !== null && !execError && execSteps.every((s) => s.state !== "active") && (
            <div className="panel flex items-start gap-4 p-4">
              <Seal size={46} />
              <div>
              <p className="display text-lg text-aye">Referendum #{newIndex} is on the record</p>
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
          {execError && newIndex === null && (
            <button onClick={() => setStep("review")} className="btn btn-ghost">
              <ArrowLeft size={15} /> Back to review
            </button>
          )}
        </div>
      )}
    </div>
  );
}
