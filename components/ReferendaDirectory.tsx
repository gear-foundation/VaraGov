"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { GovernanceNav } from "@/components/GovernanceNav";
import { Guilloche } from "@/components/Guilloche";
import { ReferendumRow, Skeleton } from "@/components/referenda";
import type { RefMeta } from "@/lib/content";
import { ONGOING_PHASES, type Referendum } from "@/lib/chain/referenda";
import type { TrackInfo } from "@/lib/chain/tracks";

const TABS = ["All", "Ongoing", "Approved", "Rejected"] as const;
type Tab = (typeof TABS)[number];

type DirectoryKind = "token" | "fellowship";

const COPY: Record<
  DirectoryKind,
  {
    eyebrow: string;
    title: string;
    subject: string;
    empty: string;
    hrefBase: string;
    fallbackLabel: string;
  }
> = {
  token: {
    eyebrow: "The on-chain parliament of Vara Network",
    title: "Token-holder referenda",
    subject: "proposals put to token holders",
    empty: "No token-holder referenda are ongoing right now.",
    hrefBase: "/referenda",
    fallbackLabel: "OpenGov",
  },
  fellowship: {
    eyebrow: "The ranked collective of Vara Network",
    title: "Fellowship referenda",
    subject: "proposals considered by the Fellowship",
    empty: "No Fellowship referenda are ongoing right now.",
    hrefBase: "/fellowship/referenda",
    fallbackLabel: "Fellowship",
  },
};

export function ReferendaDirectory({
  kind,
  referenda,
  tracks,
  meta,
  isPending,
  error,
}: {
  kind: DirectoryKind;
  referenda: Referendum[] | undefined;
  tracks: TrackInfo[] | undefined;
  meta?: Map<number, RefMeta>;
  isPending: boolean;
  error: Error | null;
}) {
  const copy = COPY[kind];
  const [tab, setTab] = useState<Tab>("All");
  const [trackFilter, setTrackFilter] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!referenda) return [];
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return referenda.filter((referendum) => {
      if (tab === "Ongoing" && !ONGOING_PHASES.includes(referendum.phase)) return false;
      if (tab === "Approved" && referendum.phase !== "approved") return false;
      if (
        tab === "Rejected" &&
        !["rejected", "cancelled", "timedOut", "killed"].includes(referendum.phase)
      ) {
        return false;
      }
      const trackId = referendum.trackId ?? meta?.get(referendum.index)?.trackId ?? null;
      if (trackFilter !== "all" && trackId !== trackFilter) return false;
      if (words.length > 0) {
        const track = tracks?.find((candidate) => candidate.id === trackId);
        const haystack = `#${referendum.index} ${referendum.index} ${
          meta?.get(referendum.index)?.blob ?? ""
        } ${track?.displayName.toLowerCase() ?? ""} ${
          referendum.proposer?.toLowerCase() ?? ""
        }`;
        if (!words.every((word) => haystack.includes(word))) return false;
      }
      return true;
    });
  }, [referenda, tab, trackFilter, meta, tracks, query]);

  const ongoingCount = referenda?.filter((referendum) =>
    ONGOING_PHASES.includes(referendum.phase),
  ).length;

  return (
    <div>
      <div className="relative overflow-hidden">
        <Guilloche className="pointer-events-none absolute -top-56 -right-40 h-[480px] w-[480px] sm:-top-48 sm:-right-24" />
        <div className="anim-rise relative flex flex-col gap-5 pt-4 pb-6 sm:flex-row sm:items-end sm:justify-between sm:pt-7">
          <div className="min-w-0">
            <p className="label-serif">{copy.eyebrow}</p>
            <h1 className="display mt-1.5 text-[38px] leading-none font-semibold text-balance sm:text-[52px]">
              {copy.title}
            </h1>
            <p className="mt-3 text-sm text-muted">
              {referenda ? (
                <>
                  <span className="tnum font-medium text-ink">{referenda.length}</span>{" "}
                  {copy.subject} ·{" "}
                  <span className="tnum font-medium text-accent-ink">{ongoingCount}</span>{" "}
                  ongoing
                </>
              ) : (
                "Reading the chain…"
              )}
            </p>
          </div>
          <div className="w-full shrink-0 sm:w-auto sm:pb-0.5">
            <GovernanceNav />
          </div>
        </div>
        <div className="anim-rule h-[3px] border-b-3 border-double border-line-strong" />
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-72 sm:flex-none">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, track, №…"
            aria-label={`Search ${copy.title.toLowerCase()}`}
            className="input h-[38px] !pl-9"
          />
        </div>
        <div
          role="tablist"
          aria-label="Filter by status"
          className="flex max-w-full overflow-x-auto rounded-[3px] border border-line bg-surface p-0.5"
        >
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
              className={`rounded-[2px] px-3 py-1.5 text-sm transition-colors duration-150 ${
                tab === item
                  ? "bg-accent-soft font-medium text-accent-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <select
          value={trackFilter === "all" ? "all" : String(trackFilter)}
          onChange={(event) =>
            setTrackFilter(event.target.value === "all" ? "all" : Number(event.target.value))
          }
          aria-label="Filter by track"
          className="input h-[38px] w-auto max-w-full"
        >
          <option value="all">All tracks</option>
          {tracks?.map((track) => (
            <option key={track.id} value={track.id}>
              {track.displayName}
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
                ? copy.empty
                : "No referenda match this filter."}
          </p>
        </div>
      ) : (
        <div className="panel divide-y divide-line overflow-hidden">
          {filtered.map((referendum, index) => {
            const trackId =
              referendum.trackId ?? meta?.get(referendum.index)?.trackId ?? null;
            return (
              <ReferendumRow
                key={referendum.index}
                r={referendum}
                track={tracks?.find((track) => track.id === trackId)}
                title={meta?.get(referendum.index)?.title}
                hrefBase={copy.hrefBase}
                fallbackLabel={copy.fallbackLabel}
                stagger={Math.min(index, 14) * 25}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
