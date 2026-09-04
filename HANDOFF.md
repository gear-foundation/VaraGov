# VaraGov — project handoff

Status as of 2026-08-27. This document is the entry point for the developer or
agent who continues the project. Documentation map:

| Document | What's in it |
|---|---|
| **HANDOFF.md** (this one) | what's done, how to run it, known pitfalls, what remains |
| [SPEC.md](SPEC.md) | the full specification: architecture, DB schema, curve math, wizard flow, design brief, phases with acceptance criteria |
| [README.md](README.md) | a short run reference |
| [AGENTS.md](AGENTS.md) | instructions for AI agents (commands, constraints) |
| [docs/screenshots/](docs/screenshots/) | screenshots of the working app (QA pass) |

## What this is

A self-hosted OpenGov interface for Vara Network — a replacement for
vara.subsquare.io. Referenda list, live tallies and approval/support curves,
conviction voting, a referendum-creation wizard, wallet-signed titles/
descriptions/comments (SIMA pattern — no sessions or logins).

## State: phases 0–5 of 6 implemented and verified

Acceptance criteria live in SPEC.md §8. What was verified live against Vara mainnet:

| Phase | What was built | How it was verified |
|---|---|---|
| 0. Skeleton | Next.js 16 (App Router, TS), Tailwind 4, RPC connection with fallbacks, dark/light themes, a live finalized-block number in the header | `npm run build` green; the block ticks live |
| 1. Explorer | `/referenda` + `/referenda/[id]` for token holders; `/fellowship` + `/fellowship/referenda/[id]` for the ranked collective; tabs, track filters and decoded calls come straight from the chain | token-holder explorer verified against the historical set; Fellowship list loaded all 72 entries and detail #71 from mainnet RPC |
| 2. Wallets + voting | connect modal (polkadot.js/SubWallet/Talisman/Nova via `@polkadot/extension-dapp`), Aye/Nay/Abstain vote popup + conviction, `/votes` (My votes, removeVote, unlock), decision-deposit button | UI states verified in the browser; **the signature itself was NOT exercised with a real wallet — see "What remains"** |
| 3. Content + comments | Postgres + Prisma 7, SIMA: every title/comment is a signed JSON message; the server checks the signature, timestamp ±10 min, a proposer gate for titles, anti-spam (balance ≥ ED + 10/hour rate limit) | `scripts/check-sima.mts` — 5 scenarios against a live dev server and the live chain, all passed |
| 4. Creation wizard | `/new`: 5 steps (type → track with auto-suggestion → text → review with costs → execution chain: proposal preimage → submit → SIMA → metadata preimage → setMetadata) | Mainnet E2E completed on referendum #80: both preimages, submit, signed SIMA content, metadata, decision deposit, vote/change/remove/unlock, and signed comment create/edit/replay rejection |
| 5. Worker + backfill | `worker/worker.mts`: listens to finalized blocks, terminal events → final tally, vote snapshot from the parent block's state, cursor + catch-up via the archive node. `scripts/backfill.mts`: one-time history import | **backfill completed: 78/78 referenda with final tallies, 2005 per-voter votes**; spot-checked against Subsquare (#74, #77). Worker smoke-tested: live mode advances the cursor; a restart caught up 36 missed blocks from the cursor |
| 6. Polish/deploy | NOT done: production VPS deploy, domain/TLS, a Lighthouse pass. The Dockerfile and the `prod` compose profile are written but never run | — |

Self-checks: `npm run check` (curve math + the SIMA API; the latter needs a running dev server and Postgres).

## Running from scratch (clean clone)

Requirements: Node 22+, Docker (for Postgres). Ports: 3000 (web), 5432 (pg).

```bash
npm install
cp .env.example .env              # DATABASE_URL for the local Postgres
docker compose up -d postgres    # Postgres 17 on :5432
npx prisma migrate dev           # apply migrations + generate the client
npm run dev                      # web at http://localhost:3000
```

In separate terminals (as needed):

```bash
npm run worker      # block listener: referenda events → DB, vote snapshots
npm run backfill    # one-time history import (idempotent, already ran)
npm run check       # self-checks (curves — always; SIMA — needs live dev+pg)
npm test            # fast unit tests for SIMA validation and indexer parsing
npm run build       # production build (do NOT run while dev is up — shared .next)
```

Production (single VPS): set a strong `VARAGOV_DB_PASSWORD`, then
`docker compose --profile prod up -d --build` brings up web + worker + postgres,
waits for Postgres health, and applies migrations before the app starts. Put
Caddy/nginx with TLS in front.

## Code map

```
app/
  referenda/page.tsx        list (client-side, live from the chain)
  referenda/[id]/page.tsx   details: tally, curves, history, comments, vote
  fellowship/page.tsx       ranked-collective referenda list (live RPC)
  fellowship/referenda/…    read-only Fellowship referendum details
  new/page.tsx              creation wizard (5 steps, all logic in one file)
  votes/page.tsx            My votes: votes/delegations/locks per track
  api/content/…             GET titles, POST provide_context (SIMA)
  api/comments/[index]/…    GET/POST comments (SIMA + anti-spam)
  api/referenda/[index]/…   history from the DB: finalTally + per-voter votes
lib/chain/                  client-side chain layer:
  ApiProvider.tsx           ApiPromise context + finalized block (RPC with fallbacks)
  referenda.ts              referendumInfoFor parsing (isomorphic, used by the server too)
  tracks.ts                 track parameters from api.consts + per-track origin
  curves.ts                 linearDecreasing/reciprocal math (bignumber)
  voting.ts, tx.ts, wallet.tsx, hooks.ts, format.ts
lib/server/                 server layer (relative imports — runs under tsx):
  db.ts                     Prisma singleton (@prisma/adapter-pg)
  chain.ts                  server-side ApiPromise singleton
  verify.ts                 SIMA signature verification (u8aWrapBytes!)
  indexer.ts                logic shared by the worker and the backfill
worker/worker.mts           listener process (tsx), cursor in WorkerCursor
scripts/backfill.mts        one-time history import from the archive node
scripts/check-*.{ts,mts}    self-checks
prisma/schema.prisma        Referendum, Comment, Vote, TallySnapshot, WorkerCursor
components/                 UI: referenda.tsx (cards/pills), VotePopup, WalletButton,
                            Comments, EditContent, HistoryPanel, CurveChart, Header
```

Principles (from SPEC.md §1, in short): live data for ongoing referenda comes
only from the chain, never the DB; the final tally exists ONLY in terminal events
(Confirmed/Rejected/…) — which is why the worker is mandatory for history;
off-chain content is signed messages only; no third-party SaaS/indexers at runtime.

## Known pitfalls (stepped on — don't repeat)

1. **Prisma is pinned to 7.10.0.** `prisma@latest` = 8.0.0-rc with a completely
   new CLI (`migrate` → `migration`, etc.). Do not upgrade casually. In Prisma 7
   the DB URL lives in `prisma.config.ts` (not the schema), the client goes
   through `@prisma/adapter-pg`, and the `prisma-client` generator emits into
   `lib/generated/prisma/`.
2. **Never run `npm run build` while `npm run dev` is up** — they share the
   `.next` folder and the dev server hangs. Stop dev first
   (`pkill -f "next dev"`).
3. **`wss://rpc.vara.network` is a pruned node.** Only
   `archive-rpc.vara-network.io` / `archive.vara-network.io` serve history
   (public, state from genesis — verified). The worker and backfill go straight
   to the archive nodes.
4. **Message signing: extensions wrap bytes in `<Bytes>…</Bytes>`** — server
   verification must use `u8aWrapBytes` (already done in
   `lib/server/verify.ts`). Ledger does not support signRaw: those users can
   vote but not comment (a documented limitation).
5. **`lib/server/*` uses relative imports** (not `@/`) so the worker and scripts
   run under tsx without alias gymnastics. Keep that rule.
6. **tsx + top-level await** requires the `.mts` extension (package.json has no
   `"type": "module"`).
7. **The dev console always shows 1 warning** — "WebSocket is closed before the
   connection is established" — a React StrictMode artifact (double-mount tears
   down the first connection). Absent in the production build. Don't fix it,
   don't worry about it.
8. **The Subsquare codebase** (github.com/opensquare-network/subsquare) has no
   license and its README forbids commercial use. Reading it as a reference is
   fine; copying code is not.

## What remains

Priority (before production):

1. **QA of signing with a real wallet** — the only unexercised link. Checklist:
   an Aye/Nay/Abstain vote + removeVote + unlock; creating a text proposal via
   the wizard (all 4 signatures of the chain); placeDecisionDeposit; a title via
   EditContent + setMetadata; a comment. Mainnet currently has no ongoing
   referenda — test voting when one appears, or run a local Vara node, or wait
   for a testnet equivalent.
2. **Phase 6 of SPEC.md**: deploy the `prod` compose profile to a VPS, domain,
   TLS, mobile layout (classes are responsive but never eyeballed), finish
   empty/error states, Lighthouse ≥ 90.
3. **Worker in production**: the local smoke test passed (the cursor advances; a
   restart catches up missed blocks — the SPEC §8 phase-5 criterion); what
   remains is running it as a persistent process in production with an alert on
   cursor lag.

Deliberately deferred (v2, see SPEC §2): delegation UI (read-only for now),
Fellowship voting/creation and historical indexing, a treasury dashboard,
notifications, full-text search, event-based
convictionVoting parsing (votes come from periodic `votingFor` snapshots every
~100 blocks — sufficient at Vara's scale), importing the 78 old titles from
Subsquare (an optional step; legal caveats in SPEC §1.4).

## Decision context

The architecture was selected by a /council protocol run (3 generators,
3 reviewers; facts verified against live nodes and the polkadot-sdk sources) —
the final report and all verified facts are in SPEC.md §0. A rendered version
of the spec (in Russian, produced for the original team review):
https://claude.ai/code/artifact/522aa665-a022-4146-a4ce-2479155af8ba
