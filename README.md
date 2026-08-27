# VaraGov

Self-hosted OpenGov governance UI for Vara Network — referenda list, live tallies
and threshold curves, conviction voting, a guided referendum-creation wizard, and
wallet-signed off-chain titles/descriptions/comments.

**Taking over this project? Read [HANDOFF.md](HANDOFF.md) first** — status,
verified/unverified surface, pitfalls, remaining work. Full specification:
[SPEC.md](SPEC.md). Screenshots: [docs/screenshots/](docs/screenshots/).

## Stack

Next.js (App Router, TS) · @polkadot/api · Tailwind 4 · Postgres + Prisma 7 ·
worker process indexing finalized blocks from the public Vara archive nodes.

## Development

```bash
npm install
cp .env.example .env              # DATABASE_URL for local Postgres
docker compose up -d postgres     # local Postgres on :5432
npx prisma migrate dev            # apply migrations + generate client
npm run dev                       # web on :3000
npm run worker                    # event listener (separate terminal)
npm run backfill                  # one-time: import 78 historical referenda
npm run check                     # self-checks: curve math + SIMA API (needs dev server)
```

## Production (single VPS)

```bash
docker compose --profile prod up -d --build   # web + worker + postgres
```

Put Caddy/nginx with TLS in front of :3000.

## Architecture notes

- Live state (tallies, tracks, my votes) is read straight from chain RPC — the DB
  is never authoritative for ongoing referenda.
- Final tallies exist ONLY in the terminal events (`Confirmed/Rejected/…`); the
  worker captures them and snapshots the per-voter breakdown from the parent
  block's state. Missed blocks are re-processed on restart via the archive node
  (cursor in `WorkerCursor`).
- Off-chain content is SIMA-style: each title/description/comment is a standalone
  wallet-signed JSON message, verified server-side (proposer check for titles,
  existential-deposit + rate-limit gate for comments). No sessions or cookies.
- Known limitation: wallets without `signRaw` (Ledger) can vote but not comment.
