"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  callTreeToJson,
  isDecodedCallNode,
  type DecodedCallArg,
  type DecodedCallNode,
  type DecodedCallValue,
} from "@/lib/chain/call-decoder";

type View = "tree" | "table" | "json";

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
        className={
          isKey
            ? "text-accent-ink"
            : isString
              ? "text-aye"
              : "text-warn"
        }
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

function PrimitiveValue({ value }: { value: DecodedCallValue }) {
  if (value === null) return <span className="text-muted">null</span>;
  if (typeof value === "boolean" || typeof value === "number") {
    return <span className="tnum text-warn">{String(value)}</span>;
  }
  if (typeof value === "string") {
    return <span className="tnum break-all text-ink">{value}</span>;
  }
  return null;
}

function TreeValue({ value, depth }: { value: DecodedCallValue; depth: number }) {
  if (isDecodedCallNode(value)) return <TreeCall node={value} depth={depth} />;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted">[]</span>;
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="min-w-0">
            <span className="mb-1 block text-[11px] text-muted">{index}</span>
            <TreeValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <div className="space-y-2">
        {Object.entries(value).map(([key, item]) => (
          <div key={key} className="min-w-0">
            <span className="mr-2 text-[11px] text-muted">{key}</span>
            <TreeValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return <PrimitiveValue value={value} />;
}

function CallArg({ arg, depth }: { arg: DecodedCallArg; depth: number }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 p-3">
      <p className="mb-1 text-[11px] text-muted">
        <span className="font-medium text-ink">{arg.name}</span>
        {" · "}
        {arg.type}
      </p>
      <TreeValue value={arg.value} depth={depth + 1} />
    </div>
  );
}

function SailsDetails({ node, depth }: { node: DecodedCallNode; depth: number }) {
  const message = node.sails;
  if (!message) return null;
  const route =
    message.service && message.method
      ? `${message.service}.${message.method}`
      : "Unknown Sails payload";

  return (
    <div className="mb-3 rounded-lg border border-accent/40 bg-accent-soft p-3">
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
        <div className="mt-3 border-t border-accent/25 pt-3">
          <div className="space-y-2">
            {message.args.map((arg) => <CallArg key={arg.name} arg={arg} depth={depth + 1} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function TreeCall({ node, depth = 0 }: { node: DecodedCallNode; depth?: number }) {
  return (
    <details open={depth === 0} className="group/call min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg py-1 text-sm focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={15}
          className="shrink-0 text-muted transition-transform group-open/call:rotate-90"
        />
        <code className="font-semibold text-accent-ink">
          {node.section}.{node.method}
        </code>
        <span className="tnum ml-auto shrink-0 text-[10px] text-muted">
          {node.callIndex}
        </span>
      </summary>
      <div className="ml-[7px] border-l border-line pt-2 pl-4">
        {node.docs && (
          <p className="mb-3 text-xs leading-relaxed text-muted">{node.docs}</p>
        )}
        <SailsDetails node={node} depth={depth} />
        <div className="space-y-2">
          {node.args.length > 0 ? (
            node.args.map((arg) => <CallArg key={arg.name} arg={arg} depth={depth} />)
          ) : (
            <p className="text-xs text-muted">No arguments</p>
          )}
        </div>
      </div>
    </details>
  );
}

type FlatRow = { path: string; type: string; value: string };

function flattenValue(
  value: DecodedCallValue,
  path: string,
  type: string,
  rows: FlatRow[],
) {
  if (isDecodedCallNode(value)) {
    rows.push({ path, type: "Call", value: `${value.section}.${value.method}` });
    value.args.forEach((arg) =>
      flattenValue(arg.value, `${path}.${arg.name}`, arg.type, rows),
    );
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) rows.push({ path, type, value: "[]" });
    value.forEach((item, index) => flattenValue(item, `${path}[${index}]`, type, rows));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      flattenValue(item, `${path}.${key}`, type, rows),
    );
    return;
  }
  rows.push({ path, type, value: String(value) });
}

function CallTable({ root }: { root: DecodedCallNode }) {
  const rows = useMemo(() => {
    const result: FlatRow[] = [];
    root.args.forEach((arg) => flattenValue(arg.value, arg.name, arg.type, result));
    return result;
  }, [root]);

  return (
    <div className="max-h-[36rem] overflow-auto rounded-lg border border-line">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-surface-2 text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Path</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={`${row.path}-${index}`}>
              <td className="tnum px-3 py-2 align-top text-accent-ink">{row.path}</td>
              <td className="px-3 py-2 align-top whitespace-nowrap text-muted">{row.type}</td>
              <td className="tnum max-w-md break-all px-3 py-2 align-top">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CallViewer({ root }: { root: DecodedCallNode }) {
  const [view, setView] = useState<View>("tree");
  const [beautified, setBeautified] = useState(true);
  const json = useMemo(() => callTreeToJson(root), [root]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-line bg-surface-2 p-0.5" role="tablist">
          {(["tree", "table", "json"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={view === item}
              onClick={() => setView(item)}
              className={`rounded-md px-3 py-1 text-xs capitalize transition-colors ${
                view === item ? "bg-surface font-medium text-ink shadow-sm" : "text-muted"
              }`}
            >
              {item}
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

      {view === "tree" ? (
        <TreeCall node={root} />
      ) : view === "table" ? (
        <CallTable root={root} />
      ) : (
        <HighlightedJson value={json} beautified={beautified} />
      )}
    </div>
  );
}
