"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useReferendaList, useTracks } from "@/lib/chain/hooks";
import { ONGOING_PHASES } from "@/lib/chain/referenda";
import { useRefMeta } from "@/lib/content";
import { ReferendumRow, Skeleton } from "@/components/referenda";
import { Guilloche } from "@/components/Guilloche";

const TABS = ["All", "Ongoing", "Approved", "Rejected"] as const;
type Tab = (typeof TABS)[number];

export default function ReferendaPage() {
  const { data: referenda, isPending, error } = useReferendaList();
  const tracks = useTracks();
  const meta = useRefMeta();
  const [tab, setTab] = useState<Tab>("All");
  const [trackFilter, setTrackFilter] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!referenda) return [];
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return referenda.filter((r) => {
      if (tab === "Ongoing" && !ONGOING_PHASES.includes(r.phase)) return false;
      if (tab === "Approved" && r.phase !== "approved") return false;
      if (
        tab === "Rejected" &&
        !["rejected", "cancelled", "timedOut", "killed"].includes(r.phase)
      )
        return false;
      const trackId = r.trackId ?? meta?.get(r.index)?.trackId ?? null;
      if (trackFilter !== "all" && trackId !== trackFilter) return false;
      if (words.length > 0) {
        const track = tracks?.find((t) => t.id === trackId);
        const haystack = `#${r.index} ${r.index} ${meta?.get(r.index)?.blob ?? ""} ${
          track?.displayName.toLowerCase() ?? ""
        } ${r.proposer?.toLowerCase() ?? ""}`;
        if (!words.every((w) => haystack.includes(w))) return false;
      }
      return true;
    });
  }, [referenda, tab, trackFilter, meta, tracks, query]);

  const ongoingCount = referenda?.filter((r) =>
    ONGOING_PHASES.includes(r.phase),
  ).length;

  return (
    <div>
      {/* Masthead */}
      <div className="relative overflow-hidden">
        <Guilloche className="pointer-events-none absolute -top-56 -right-40 h-[480px] w-[480px] sm:-top-48 sm:-right-24" />
        <div className="anim-rise relative pt-4 pb-6 sm:pt-8">
          <p className="label-serif">The on-chain parliament of Vara Network</p>
          <h1 className="display mt-1.5 text-[40px] leading-none font-semibold text-balance sm:text-[54px]">
            Referenda
          </h1>
          <p className="mt-3 text-sm text-muted">
            {referenda ? (
              <>
                <span className="tnum font-medium text-ink">{referenda.length}</span>{" "}
                proposals put to the token holders ·{" "}
                <span className="tnum font-medium text-accent-ink">
                  {ongoingCount}
                </span>{" "}
                being decided now
              </>
            ) : (
              "Reading the chain…"
            )}
          </p>
        </div>
        <div className="anim-rule h-[3px] border-b-3 border-double border-line-strong" />
      </div>

      {/* Controls */}
      <div className="mt-5 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-72 sm:flex-none">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description, №…"
            aria-label="Search referenda"
            className="input h-[38px] !pl-9"
          />
        </div>
        <div
          role="tablist"
          aria-label="Filter by status"
          className="flex rounded-[3px] border border-line bg-surface p-0.5"
        >
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-[2px] px-3 py-1.5 text-sm transition-colors duration-150 ${
                tab === t
                  ? "bg-accent-soft font-medium text-accent-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <select
          value={trackFilter === "all" ? "all" : String(trackFilter)}
          onChange={(e) =>
            setTrackFilter(e.target.value === "all" ? "all" : Number(e.target.value))
          }
          aria-label="Filter by track"
          className="input h-[38px] w-auto"
        >
          <option value="all">All tracks</option>
          {tracks?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="panel p-6 text-sm text-nay">
          Failed to load referenda from RPC: {String(error)}. Retrying…
        </div>
      ) : isPending ? (
        <Skeleton />
      ) : filtered.length === 0 ? (
        <div className="panel anim-rise flex flex-col items-center gap-4 p-12 text-center">
          <Guilloche className="h-28 w-28 opacity-80" />
          <p className="text-sm text-muted">
            {query.trim()
              ? `Nothing in the record matches “${query.trim()}”.`
              : tab === "Ongoing"
                ? "No ongoing referenda right now — put the first question to the chamber."
                : "No referenda match this filter."}
          </p>
        </div>
      ) : (
        <div className="panel divide-y divide-line overflow-hidden">
          {filtered.map((r, i) => {
            const trackId = r.trackId ?? meta?.get(r.index)?.trackId ?? null;
            return (
              <ReferendumRow
                key={r.index}
                r={r}
                track={tracks?.find((t) => t.id === trackId)}
                title={meta?.get(r.index)?.title}
                stagger={Math.min(i, 14) * 25}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
