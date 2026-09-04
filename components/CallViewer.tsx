"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Copy } from "lucide-react";
import {
  callTreeToJson,
  isDecodedCallNode,
  type DecodedCallArg,
  type DecodedCallNode,
  type DecodedCallValue,
} from "@/lib/chain/call-decoder";

type View = "flow" | "parameters" | "json";
type ChildCall = { node: DecodedCallNode; relation: string };

const VIEW_LABEL: Record<View, string> = {
  flow: "Flow",
  parameters: "Parameters",
  json: "Raw JSON",
};

const ACTION_LABELS: Record<string, string> = {
  "whitelist.dispatchWhitelistedCallWithPreimage": "Verify whitelisted call",
  "whitelist.dispatchWhitelistedCall": "Dispatch whitelisted call",
  "utility.dispatchAs": "Dispatch with origin",
  "utility.batch": "Execute batch",
  "utility.batchAll": "Execute atomic batch",
  "utility.forceBatch": "Execute forced batch",
  "gear.sendMessage": "Send program message",
  "gear.sendMessageWithVoucher": "Send voucher-backed message",
  "system.remark": "Record an on-chain remark",
  "system.remarkWithEvent": "Record an on-chain remark",
};

function HighlightedJson({ value, beautified }: { value: unknown; beautified: boolean }) {
  const json = JSON.stringify(value, null, beautified ? 2 : undefined);
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(json)) !== null) {
    if (match.index > cursor) parts.push(json.slice(cursor, match.index));
    const isKey = Boolean(match[2]);
    const isString = Boolean(match[1]);
    parts.push(
      <span
        key={`${match.index}-${match[0]}`}
        className={isKey ? "text-accent-ink" : isString ? "text-aye" : "text-warn"}
      >
        {match[1] ?? match[0]}
      </span>,
    );
    if (match[2]) parts.push(match[2]);
    cursor = pattern.lastIndex;
  }
  if (cursor < json.length) parts.push(json.slice(cursor));

  return (
    <pre
      tabIndex={0}
      aria-label={beautified ? "Beautified proposal call JSON" : "Compact proposal call JSON"}
      className={`tnum max-h-[36rem] overflow-auto rounded-lg border border-line bg-surface-2 p-3 text-xs leading-5 ${
        beautified ? "break-words whitespace-pre-wrap" : "whitespace-pre"
      }`}
    >
      <code>{parts}</code>
    </pre>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="btn btn-ghost h-7 w-7 shrink-0 !p-0 text-muted"
      aria-label="Copy value"
      title={copied ? "Copied" : "Copy"}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

function PrimitiveValue({ value }: { value: DecodedCallValue }) {
  if (value === null) return <span className="text-muted">null</span>;
  if (typeof value === "boolean" || typeof value === "number") {
    return <span className="tnum text-warn">{String(value)}</span>;
  }
  if (typeof value === "string") {
    if (value.length <= 88) return <span className="tnum break-all text-ink">{value}</span>;
    const abbreviated = `${value.slice(0, 42)}…${value.slice(-18)}`;
    return (
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <span className="tnum min-w-0 break-all text-ink" title={value}>
            {abbreviated}
          </span>
          <CopyButton value={value} />
        </div>
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] text-muted hover:text-ink">
            Show full value
          </summary>
          <p className="tnum mt-1 break-all rounded bg-surface p-2 text-[11px] text-muted">
            {value}
          </p>
        </details>
      </div>
    );
  }
  return null;
}

function StructuredValue({ value }: { value: DecodedCallValue }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted">[]</span>;
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="min-w-0">
            <span className="mb-1 block text-[10px] text-muted">Item {index + 1}</span>
            <StructuredValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <dl className="space-y-2">
        {Object.entries(value).map(([key, item]) => (
          <div key={key} className="min-w-0">
            <dt className="mb-0.5 text-[10px] text-muted">{key}</dt>
            <dd><StructuredValue value={item} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  return <PrimitiveValue value={value} />;
}

function directCalls(value: DecodedCallValue, relation: string): ChildCall[] {
  if (isDecodedCallNode(value)) return [{ node: value, relation }];
  if (Array.isArray(value)) {
    const multiple = value.length > 1;
    return value.flatMap((item, index) =>
      directCalls(item, multiple ? `Action ${index + 1}` : relation),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => directCalls(item, key));
  }
  return [];
}

function childCalls(node: DecodedCallNode): ChildCall[] {
  return node.args.flatMap((arg) => directCalls(arg.value, arg.name));
}

function containsCall(value: DecodedCallValue): boolean {
  if (isDecodedCallNode(value)) return true;
  if (Array.isArray(value)) return value.some(containsCall);
  if (value && typeof value === "object") return Object.values(value).some(containsCall);
  return false;
}

function directArgs(node: DecodedCallNode): DecodedCallArg[] {
  return node.args.filter((arg) => !containsCall(arg.value));
}

function humanizeMethod(method: string): string {
  const words = method
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Runtime call";
}

function actionTitle(node: DecodedCallNode): string {
  if (node.sails?.service && node.sails.method) {
    return `${node.sails.programName ?? "Program"} · ${node.sails.service}.${node.sails.method}`;
  }
  const route = `${node.section}.${node.method}`;
  const label = ACTION_LABELS[route];
  if (label?.includes("batch")) {
    const count = childCalls(node).length;
    return count > 0 ? `${label} · ${count} ${count === 1 ? "action" : "actions"}` : label;
  }
  return label ?? humanizeMethod(node.method);
}

function relationLabel(relation: string | undefined): string | null {
  if (!relation) return null;
  const normalized = relation.replace(/[_-]+/g, " ").trim().toLowerCase();
  if (["call", "proposal", "proposal call"].includes(normalized)) return null;
  return humanizeMethod(relation);
}

function orderedCalls(root: DecodedCallNode): DecodedCallNode[] {
  const result: DecodedCallNode[] = [];
  const visit = (node: DecodedCallNode) => {
    result.push(node);
    childCalls(node).forEach(({ node: child }) => visit(child));
  };
  visit(root);
  return result;
}

function CallArg({ arg }: { arg: DecodedCallArg }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 p-3">
      <p className="mb-1 text-[11px] text-muted">
        <span className="font-medium text-ink">{arg.name}</span>
        {" · "}
        {arg.type}
      </p>
      <StructuredValue value={arg.value} />
    </div>
  );
}

function SailsDetails({ node }: { node: DecodedCallNode }) {
  const message = node.sails;
  if (!message) return null;
  const route =
    message.service && message.method
      ? `${message.service}.${message.method}`
      : "Unknown Sails payload";

  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-accent-ink">Sails · {route}</p>
        <span className="text-[10px] uppercase tracking-wider text-muted">
          {message.idlStatus === "decoded"
            ? "IDL decoded"
            : message.idlStatus === "missing"
              ? "IDL not registered"
              : "Payload not decoded"}
        </span>
      </div>
      <p className="tnum mt-1 break-all text-[11px] text-muted">
        {message.programName ? `${message.programName} · ` : ""}Program {message.destination}
      </p>
      {message.docs && <p className="mt-2 text-xs leading-relaxed text-muted">{message.docs}</p>}
      {message.args && (
        <div className="mt-3 space-y-2 border-t border-accent/25 pt-3">
          {message.args.map((arg) => <CallArg key={arg.name} arg={arg} />)}
        </div>
      )}
    </div>
  );
}

function StepParameters({ node }: { node: DecodedCallNode }) {
  const args = directArgs(node);
  if (args.length === 0 && !node.sails) return null;

  return (
    <details className="group/params mt-3 border-t border-line pt-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={13}
          className="transition-transform group-open/params:rotate-90"
          aria-hidden="true"
        />
        Parameters{args.length > 0 ? ` · ${args.length}` : ""}
      </summary>
      <div className="mt-2 space-y-2">
        <SailsDetails node={node} />
        {args.map((arg) => <CallArg key={arg.name} arg={arg} />)}
      </div>
    </details>
  );
}

function FlowStep({
  node,
  numbers,
  relation,
  depth,
}: {
  node: DecodedCallNode;
  numbers: Map<DecodedCallNode, number>;
  relation?: string;
  depth: number;
}) {
  const children = childCalls(node);
  const route = `${node.section}.${node.method}`;
  const connector = relationLabel(relation);

  return (
    <div className={depth === 0 ? "" : "ml-3 border-l border-line pl-3 sm:ml-5 sm:pl-5"}>
      {connector && (
        <p className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
          {connector}
        </p>
      )}
      <article className="rounded-lg border border-line bg-surface p-3 shadow-[0_1px_0_rgb(0_0_0/0.03)] sm:p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-ink">
            {numbers.get(node)}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-ink">{actionTitle(node)}</h3>
            <code className="mt-0.5 block truncate text-[11px] text-accent-ink" title={route}>
              {route}
            </code>
          </div>
          <span className="tnum shrink-0 text-[10px] text-muted" title="Runtime call index">
            {node.callIndex}
          </span>
        </div>
        {node.docs && <p className="mt-2 text-xs leading-relaxed text-muted">{node.docs}</p>}
        <StepParameters node={node} />
      </article>
      {children.length > 0 && (
        <div className="mt-2 space-y-2">
          {children.map((child, index) => (
            <FlowStep
              key={`${child.node.callIndex}-${index}`}
              node={child.node}
              numbers={numbers}
              relation={child.relation}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ParametersView({ calls }: { calls: DecodedCallNode[] }) {
  return (
    <div className="space-y-3">
      {calls.map((node, index) => {
        const args = directArgs(node);
        return (
          <section key={`${node.callIndex}-${index}`} className="rounded-lg border border-line p-3 sm:p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="tnum text-xs font-semibold text-accent-ink">#{index + 1}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">{actionTitle(node)}</h3>
                <code className="mt-0.5 block truncate text-[11px] text-muted">
                  {node.section}.{node.method}
                </code>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <SailsDetails node={node} />
              {args.map((arg) => <CallArg key={arg.name} arg={arg} />)}
              {args.length === 0 && !node.sails && (
                <p className="text-xs text-muted">No direct parameters.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function CallViewer({ root }: { root: DecodedCallNode }) {
  const [view, setView] = useState<View>("flow");
  const [beautified, setBeautified] = useState(true);
  const json = useMemo(() => callTreeToJson(root), [root]);
  const calls = useMemo(() => orderedCalls(root), [root]);
  const numbers = useMemo(
    () => new Map(calls.map((call, index) => [call, index + 1])),
    [calls],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full rounded-lg border border-line bg-surface-2 p-0.5" role="tablist">
          {(Object.keys(VIEW_LABEL) as View[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={view === item}
              onClick={() => setView(item)}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                view === item ? "bg-surface font-medium text-ink shadow-sm" : "text-muted"
              }`}
            >
              {VIEW_LABEL[item]}
            </button>
          ))}
        </div>
        {view === "json" && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted select-none">
            <input
              type="checkbox"
              checked={beautified}
              onChange={(event) => setBeautified(event.target.checked)}
              className="h-3.5 w-3.5 accent-accent-ink"
            />
            JSON Beautify
          </label>
        )}
      </div>

      {view === "flow" ? (
        <FlowStep node={root} numbers={numbers} depth={0} />
      ) : view === "parameters" ? (
        <ParametersView calls={calls} />
      ) : (
        <HighlightedJson value={json} beautified={beautified} />
      )}
    </div>
  );
}
