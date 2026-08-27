<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# VaraGov — project instructions

Self-hosted OpenGov governance UI for Vara Network (Substrate). Start with
**HANDOFF.md** (status, run commands, known pitfalls, remaining work), then
**SPEC.md** (full spec: architecture, DB schema, curve math, wizard flow,
acceptance criteria per phase). Do not re-derive decisions settled there.

## Commands

- `npm run dev` — web on :3000 (needs `docker compose up -d postgres` + `.env` from `.env.example` + `npx prisma migrate dev` once)
- `npm run worker` — finalized-block listener (separate process, cursor in DB)
- `npm run backfill` — one-time history import (idempotent, already ran)
- `npm run check` — self-checks: curve math (standalone) + SIMA API (needs running dev server)
- `npm run build` — production build. NEVER run while `npm run dev` is up (shared `.next/`, the dev server hangs; `pkill -f "next dev"` first)
- `npm run lint`

## Hard rules

- Prisma is PINNED to 7.10.0 — `prisma@latest` is a 8.0.0-rc with an incompatible CLI. DB url lives in `prisma.config.ts`, client via `@prisma/adapter-pg`, generated into `lib/generated/prisma/`.
- Live data for ongoing referenda comes from chain RPC only, never from the DB. The DB is for history (final tallies exist ONLY in terminal events), off-chain content, and comments.
- `lib/server/*` must keep relative imports (no `@/` alias) — the worker and scripts run under tsx. Standalone tsx scripts with top-level await use the `.mts` extension.
- Server-side SIMA verification must keep the `u8aWrapBytes` path (extensions wrap signed bytes in `<Bytes>…</Bytes>`).
- Never copy code from the Subsquare repo (no license, commercial use forbidden). Patterns only.
- Archive endpoints (`wss://archive-rpc.vara-network.io`) for history/worker; `wss://rpc.vara.network` is pruned.
- One dev-console warning ("WebSocket is closed before the connection is established") is a React StrictMode artifact, dev-only. Do not chase it.

## Untested surface (be careful)

Real-wallet signing was never exercised (no extension in the QA browser; no
ongoing referendum on mainnet at build time): voting, the wizard's 4-signature
chain, decision deposit, setMetadata, comment signing. UI states around them are
verified; the extrinsics follow SPEC.md §5–6. Test on a throwaway account first.

## Design system — "Chamber & Gazette"

The visual concept is a digital parliament: House-of-Commons deep green
chamber (dark theme, default) / gazette paper (light theme), brass-gold accent,
Fraunces serif display type, engraved guilloche linework, verdict stamps.
It is deliberately NOT the neon-on-black crypto look — do not drift back to it.

`app/globals.css` defines the shared vocabulary — use it, don't hand-roll styles:
OKLCH tokens (light `:root` / dark `.dark`), `.panel`, `.btn` +
`.btn-primary/.btn-ghost/.btn-soft`, `.input`, `.overlay`/`.modal`,
`.display` (Fraunces) and `.label-serif` (italic serif panel headers),
`.stamp` (verdict stamp with grain mask + stamp-in animation),
`.rule-double` (gazette double rule), `.row-hover`/`.row-title`/`.row-index`
(ledger rows), `.odometer` (rolling block digits — `components/BlockTicker.tsx`),
`.guilloche` drift (`components/Guilloche.tsx`), motion utilities (`.anim-rise`,
`.anim-pop`, `.anim-bar`, `.anim-rule`, `.skeleton`, `.live-dot`, staggered via
`--stagger`), and a semantic z-scale. Icons are lucide-react only — no emoji in
UI. All motion respects `prefers-reduced-motion`. The seal logo lives in
`components/Logo.tsx`; the wax seal (`components/Seal.tsx`, `.seal-in`) marks
completed signatures; `.drop-cap` styles the first letter of referendum
descriptions. Wallet modal is portaled to <body> — the header's backdrop-filter
traps position:fixed (keep any new header-launched dialog portaled too).
