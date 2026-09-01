# VaraGov — specification for a self-hosted OpenGov interface for Vara Network

Version 1.0 · 2026-08-26 · Produced by the council protocol (3 generators, 3 reviewers; every fact verified against live nodes and the polkadot-sdk sources).

Goal: replace vara.subsquare.io with our own minimal, beautiful, convenient governance interface: referenda list, detail pages, referendum creation with title/description, conviction voting, comments.

---

## 0. Verified facts (the basis for every decision)

| Fact | Value | How verified |
|---|---|---|
| Network | Vara Network, specName `vara`, specVersion 11000 | RPC `wss://rpc.vara.network` |
| Parameters | 3 s blocks, ss58 = 137, decimals = 12, token VARA | RPC |
| Pallets | `referenda`, `convictionVoting`, `preimage`, `treasury`, `whitelist`, `fellowship*`, `identity`, `utility`, `scheduler` | RPC |
| Tracks | 15 of them, ids 0–41; ALL parameters (deposits, periods, minApproval/minSupport curves) live in `api.consts.referenda.tracks`. Hardcode nothing | RPC |
| Extrinsics | `referenda.submit / placeDecisionDeposit / refundDecisionDeposit / refundSubmissionDeposit / setMetadata(index, hash) / cancel / kill`; `preimage.notePreimage`; `convictionVoting.vote / removeVote / delegate / undelegate / unlock`; `treasury.spend / spendLocal` | RPC |
| Deposits | submission 1500 VARA (`consts.referenda.submissionDeposit`); decision — per track, 150…15,000,000 VARA; `undecidingTimeout` = 403,200 blocks = 14 days | RPC + wiki |
| Conviction | 0.1x (no lock) … 6x (224 days); `voteLockingPeriod` = 201,600 blocks = 7 days; `maxVotes` = 512 per track | RPC |
| Scale | 78 referenda in the network's entire history; a handful ongoing at any time; audience of tens to hundreds of users | Subsquare API |
| ⚠️ Critical | In `pallet-referenda` the final tally exists ONLY in the `Ongoing` state variant. Terminal variants (`Approved/Rejected/Cancelled/TimedOut/Killed`) store only the moment (block number) and deposits. The final tally is carried IN THE EVENTS `Confirmed/Rejected/Cancelled/TimedOut/Killed` at the moment of completion | polkadot-sdk sources, `substrate/frame/referenda` |
| ⚠️ Critical | `wss://rpc.vara.network` is a pruned node ("State already discarded" at genesis) | JSON-RPC check |
| ✅ Solves it | Public ARCHIVE nodes for Vara exist and serve state from genesis: `wss://archive-rpc.vara-network.io`, `wss://archive.vara-network.io` | JSON-RPC genesis-state check |
| Subscan | API is paid (403 without a key) — do NOT depend on it | curl |
| Subsquare | Code has no license, the README forbids commercial use — do NOT fork, patterns only. Their API is referer-gated | repository |

---

## 1. Architecture (the council's decision)

**One repository, three processes, one VPS.**

```
┌────────────────────────── VPS (docker-compose) ──────────────────────────┐
│                                                                          │
│  web (Next.js App Router, TS)         worker (Node, same repository)     │
│  ├─ SSR/pages + API routes            ├─ finalized-block subscription    │
│  ├─ live client-side RPC subs         ├─ referenda.* events → Postgres   │
│  └─ SIMA signature verification       ├─ votingFor snapshots → Postgres  │
│                                       └─ cursor: last_finalized_block    │
│              Postgres (referenda, votes, content, comments)              │
└──────────────────────────────────────────────────────────────────────────┘
        │ live reads + tx submission            │ catch-up after restart
   wss://rpc.vara.network  (+fallbacks)   wss://archive-rpc.vara-network.io
```

Principles:

1. **Live state comes only from the chain.** Current tally, status, track constants, the current user's vote — direct RPC queries/subscriptions (`referenda.referendumInfoFor`, `api.consts.referenda.tracks`, `convictionVoting.votingFor`). Never show a stale DB tally for an ongoing referendum.
2. **History comes from the worker.** Since the final tally lives only in the completion event, the worker listens to finalized blocks and persists events. Restart/deploy recovery: the worker keeps a `last_processed_block` cursor in the DB and catches up through the archive node on start — a deploy window loses nothing (this removes the main risk the council found).
3. **Vote snapshot near the finish.** On a terminal event the worker immediately reads `votingFor` for the referendum's track and persists the per-voter list (voter-level data is pruned from state as accounts unlock — the completion event carries only the aggregate). Plus a periodic sync every ~100 blocks for ongoing referenda.
4. **No third-party indexers or SaaS** (Subsquid, Subscan, Subsquare API) at runtime. The only external dependency is Vara's public RPC nodes.
5. **Off-chain content is signed messages** (SIMA pattern) — no sessions, cookies, or logins. Details in §4.

### 1.1 Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js (latest stable, App Router, TypeScript) | one deployment for UI+API, best tooling |
| Chain | `@polkadot/api` + `@polkadot/extension-dapp` | the reference pairing; every wallet works out of the box (Subsquare uses the same) |
| UI | Tailwind CSS + shadcn/ui | fast, consistent, customizable |
| Charts | recharts (approval/support curves), native SVG for the rest | sufficient and light |
| Data | Postgres + Prisma | boring and reliable |
| Client state | @tanstack/react-query + a React context for ApiPromise | no Redux |
| Markdown | `react-markdown` + `rehype-sanitize` (sanitize strictly!) | descriptions and comments |
| Deploy | docker-compose (web + worker + postgres) on a VPS, Caddy/nginx with TLS | $10–20/mo |

RPC endpoints (config, order = priority): `wss://rpc.vara.network`, `wss://archive-rpc.vara-network.io`, `wss://archive.vara-network.io`. The worker and backfill go straight to the archive nodes. Auto-switch on disconnect.

### 1.2 DB schema (Prisma, main tables)

```prisma
model Referendum {
  index          Int      @id            // on-chain referendumIndex
  trackId        Int
  proposer       String                  // ss58
  proposalHash   String                  // preimage hash
  proposalLen    Int?
  callSection    String?                 // decoded call: "treasury"
  callMethod     String?                 // "spend"
  callArgs       Json?                   // decoded arguments
  status         String                  // preparing|queueing|deciding|confirming|approved|rejected|cancelled|timedOut|killed|executed
  submittedAt    Int                     // block number
  decidingSince  Int?
  decidedAt      Int?                    // block of the terminal event
  finalTally     Json?                   // {ayes, nays, support} from the completion event
  enactmentAt    Int?
  title          String?                 // off-chain, from the proposer
  contentMd      String?                 // off-chain markdown
  contentSig     String?                 // SIMA message signature
  metadataHash   String?                 // referenda.setMetadata anchor
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  comments       Comment[]
  votes          Vote[]
}

model Vote {
  id            BigInt  @id @default(autoincrement())
  refIndex      Int
  voter         String
  kind          String   // standard|split|splitAbstain|delegated
  aye           Decimal? // planck
  nay           Decimal?
  abstain       Decimal?
  conviction    Int?     // 0..6 for standard
  atBlock       Int      // block of the snapshot/event
  referendum    Referendum @relation(fields: [refIndex], references: [index])
  @@unique([refIndex, voter])
}

model Comment {
  id          String   @id @default(cuid())
  refIndex    Int
  author      String   // ss58
  contentMd   String
  signature   String   // signature over the whole payload
  payload     Json     // the original signed message
  replyToId   String?
  editedAt    DateTime?
  createdAt   DateTime @default(now())
  referendum  Referendum @relation(fields: [refIndex], references: [index])
}

model TallySnapshot {                    // for the tally-dynamics chart (forward-only, from launch)
  id        BigInt @id @default(autoincrement())
  refIndex  Int
  atBlock   Int
  ayes      Decimal
  nays      Decimal
  support   Decimal
  @@unique([refIndex, atBlock])
}

model WorkerCursor { id Int @id @default(1); lastBlock Int }
```

### 1.3 Worker

- Subscribes via `api.rpc.chain.subscribeFinalizedHeads` → reads events for each block.
- Handles: `referenda.Submitted/DecisionDepositPlaced/DecisionStarted/ConfirmStarted/ConfirmAborted/Confirmed/Rejected/Cancelled/TimedOut/Killed/MetadataSet`, `convictionVoting.*` (if the runtime emits those events — verify; if not, parse successful `convictionVoting.vote/removeVote` extrinsics, including `utility.batch*` and `proxy.proxy` wrappers — Subsquare's `useVoteCall` pattern).
- On a terminal event: store `finalTally` from the event payload + an immediate `votingFor.entries(trackId)` snapshot → the Vote table.
- Every ~100 blocks (5 min): for each ongoing referendum — a tally snapshot → TallySnapshot; a Vote refresh across active tracks.
- On start: `catchUp(cursor.lastBlock → currentFinalized)` through the archive node, then the live subscription. Idempotency via `@@unique` keys.

### 1.4 Backfill (one-time script)

1. `referendumCount()` = N. For each index 0…N−1: `referendumInfoFor(index)` — the terminal variant contains the completion block.
2. From the completion block: `api.at(blockHash)` on the archive node → that block's events → the final tally.
3. Voter-level history: `api.at(finishBlockHash).query.convictionVoting.votingFor.entries()` — the complete per-voter list at the moment of finish (the archive node holds state for any block). ~78 heavy queries, run once.
4. Optional: a one-time import of titles/descriptions for the 78 existing referenda from Subsquare's public list endpoint (for catalog continuity), marked "imported" in the UI with a link to the original. Legally: the content belongs to its community authors; import only title/content, none of their UI data. If the team has doubts — skip it and show fallback titles.

---

## 2. MVP scope

### In

| Feature | Details |
|---|---|
| Referenda list | tabs All / Ongoing / Approved / Rejected; track filter; cards with status, tally bar, time left in the current phase |
| Referendum page | title, markdown description, author, track, status timeline, live tally, approval/support curves with current thresholds, decoded call, deposits, comments |
| Voting | Aye / Nay / Abstain (SplitAbstain), a conviction slider with lock math, display of the existing vote, removeVote, unlock of expired locks |
| Referendum creation | a wizard for non-technical users, 3 proposal types (§5) |
| Decision deposit | a button on the page + a prominent reminder banner for the author (§5.4) |
| Comments | wallet-signed, markdown, 1-level replies, author edits |
| My votes | the user's votes across active/past referenda, removeVote/unlock |
| Wallets | polkadot.js extension, SubWallet, Talisman, Nova (via injectedWeb3); WalletConnect — later |

### Deliberately OUT (v2+)

Delegation management UI, a fellowship section, a treasury dashboard, notifications/subscriptions, user profiles, multisig/proxy wrapping, whale alerts, full tally history from before launch (the dynamics chart grows forward from worker launch; old referenda get final results only), web2 login, full-text search.

If the user has delegated their vote on a track — direct voting is blocked with an explanation and the delegate's name (read-only; delegation management in v2).

## 3. Chain reads: formulas and algorithms

### 3.1 Referendum status

`referendumInfoFor(index)` → `Ongoing {track, origin, proposal, enactment, submitted, submissionDeposit, decisionDeposit?, deciding?, tally, inQueue, alarm}` or a terminal variant. Ongoing phases:

- **Preparing**: `deciding == null`. Show: X of preparePeriod elapsed; whether the decision deposit is placed; the `undecidingTimeout` deadline (14 days) — unpaid means TimedOut.
- **Queueing**: `inQueue == true` — the track is full, waiting for a slot.
- **Deciding**: `deciding.since` set, `deciding.confirming == null`. Progress: `(now − since) / decisionPeriod`.
- **Confirming**: `deciding.confirming` = the block confirmation ends at. Countdown.

### 3.2 Curves (rewrite from scratch, ~100 lines, bignumber.js)

From `track.minApproval` / `track.minSupport`, each either `{linearDecreasing: {length, floor, ceil}}` or `{reciprocal: {factor, xOffset, yOffset}}`:

```
linearDecreasing(x) = ceil − (ceil − floor) · min(x·1e9, length)/length   // all in perbill
reciprocal(x)       = factor / (x·1e9 + xOffset) + yOffset                // clamp ≥ 0
x = (currentBlock − deciding.since) / decisionPeriod, clamped to [0,1]; finished → x = 1
```

Current values: `approval = ayes/(ayes+nays)`; `support = tally.support / (totalIssuance − inactiveIssuance)`. A referendum passes when approval ≥ minApproval(x) AND support ≥ minSupport(x) continuously for confirmPeriod.

Chart: the two threshold curves (0 → end of the decision period) + horizontal lines for current approval/support + a vertical "now" line + stored TallySnapshot points.

### 3.3 Conviction

`0: 0.1x/no lock, 1: 1x/7d, 2: 2x/14d, 3: 3x/28d, 4: 4x/56d, 5: 5x/112d, 6: 6x/224d`. The UI always shows the product: "10,000 VARA × 3x = 30,000 votes, locked 28 days after completion".

## 4. Off-chain content: signed messages (SIMA pattern)

No sessions, no cookies, no login. Every write is a self-contained signed message.

### 4.1 Format

```json
{
  "action": "provide_context" | "comment" | "edit_comment",
  "network": "vara",
  "refIndex": 42,
  "title": "...",            // provide_context only
  "content": "markdown...",
  "replyTo": "commentId",    // comment replies only
  "timestamp": 1756215000000
}
```

Client: `signer.signRaw({type: 'bytes', data: stringToHex(JSON.stringify(payload)), address})`. POST `{payload, address, signature}` to an API route.

### 4.2 Server-side verification (API route)

1. `signatureVerify(JSON.stringify(payload), signature, address)` from `@polkadot/util-crypto`.
2. `timestamp` within ±10 minutes of server time (replay protection for old messages; duplicates blocked by a unique key on the signature).
3. For `provide_context`: address == the referendum's on-chain proposer (from DB/chain). Only the author may set a referendum's title.
4. For `comment`: anti-spam (§4.4).
5. Store the payload+signature whole (authorship provable forever).

### 4.3 On-chain anchoring

After saving title/description the server returns `blake2_256(JSON.stringify(payload))`. Vara runtime requires metadata hashes to reference an existing preimage, so the client first calls `preimage.notePreimage` with the exact signed JSON bytes and then signs `referenda.setMetadata(index, hash)` (callable only by the proposer while the referendum is ongoing). This gives an immutable on-chain binding for the content. The metadata preimage requires a refundable deposit. If the user rejects either transaction, the content is still saved and the anchor remains optional.

### 4.4 Comment anti-spam (council decision — chain economics + limits)

- A signature is mandatory (no free anonymous comments).
- Address balance ≥ existential deposit (live RPC check): rotating freshly generated addresses becomes costly.
- Rate limit: ≤ N comments/hour per address (via DB, N=10).
- Markdown strictly sanitized, links get `rel="nofollow ugc"`, 8 KB max.

⚠️ Known limitation: `signRaw` may not work on Ledger. Those users can vote and create referenda (regular extrinsics work) but cannot comment or set titles. Document it, don't fix it in the MVP.

## 5. The "create referendum" flow (wizard, the UX core)

Five steps, a progress bar on top, a running total-cost preview at every step.

### Step 1 — Proposal type
Three cards:
1. **📝 Text proposal** — "a proposal with no executable code" → `system.remark("VaraGov:<blake2_256(title+content)>")`. Default track: general_admin (or manually chosen).
2. **💰 Treasury spend** — VARA amount + recipient address → `treasury.spend(amount, beneficiary)`. Track auto-selected by amount: ≤1,000 → small_tipper; ≤5,000 → big_tipper; ≤50,000 → small_spender; ≤500,000 → medium_spender; ≤5,000,000 → big_spender; above → treasurer. Show "Your amount falls into track X, decision deposit Y VARA".
3. **⚙️ Advanced (raw call)** — hex call data for power users: decode and display it human-readably; manual track choice among all 15 with parameters.

### Step 2 — Track
The auto-suggested track is highlighted; a table: decision deposit, prepare/decision/confirm/enactment periods in human units. A warning that the decision deposit is slashed on Kill.

### Step 3 — Title and description
Title (≤120 chars) + a markdown editor with preview and a template hint (Motivation / Description / Budget breakdown). Discussion link (optional).

### Step 4 — Review and costs
Summary: type, track, call (decoded), title. Cost table: submission deposit 1500 VARA (refundable after the decision), preimage deposit (by size, refundable), the track's decision deposit — "can be paid later, by anyone; without it the referendum times out in 14 days". Balance check: enough for submission + fees; if not — block with an explanation.

### Step 5 — Signatures (a sequential chain with a status checklist)
1. `preimage.notePreimage(callHex)` — skipped if the preimage is already on chain.
2. `referenda.submit(origin, {Lookup:{hash,len}}, {After: minEnactmentPeriod})`. Origin: root track → `{system:'Root'}`, otherwise `{Origins: '<CamelCaseTrackName>'}`.
3. `referendumIndex` from the `referenda.Submitted` event.
4. Sign the SIMA title/description message (§4) — free, instant.
5. `preimage.notePreimage(exactSignedContentPayload)` unless already stored.
6. `referenda.setMetadata(index, contentHash)`.
6. Offer to pay the decision deposit now (a button, skippable).

Success → redirect to the referendum page.

### 5.4 Decision-deposit insurance (imported from the council's critique)
If a referendum in Preparing has no decision deposit: a yellow banner on the detail page — "Referendum will expire in N days unless a decision deposit of X VARA is placed" — with a button (for any user — anyone may pay). The author sees the same banner on "My votes/My proposals".

## 6. Voting (popup)

1. On open: live-read `votingFor(address, trackId)` → if already voted, show the current vote and "Change vote" / "Remove vote" buttons; if delegated — a block naming the delegate, voting unavailable.
2. Tabs: **Aye / Nay / Abstain**. Aye/Nay: amount (max = transferable + already vote-locked; show "available to vote") + the conviction slider (§3.3) with "= N votes, tokens locked until ~date if the referendum ends now". Abstain → `SplitAbstain {abstain: amount}` (no conviction).
3. `convictionVoting.vote(index, ...)` → after inBlock re-read the vote from chain, refresh the tally, toast.
4. Removal: `removeVote(trackId, index)`; on "My votes" — an "Unlock expired" button → a `removeVote + unlock` batch over expired locks.

## 7. Design and UX (brief for implementation)

### 7.1 Visual language
- **Theme**: dark by default + light (toggle, system-default). Vara brand: black background (#0A0A0A), white text, the Vara accent green (#00FFC4 / the closest brand-book value; verify against vara.network), plus semantic accents: aye = #22C55E, nay = #EF4444, abstain = #71717A.
- **Typography**: Inter or Anek Latin (headings), tabular-nums for numbers/balances. Large calm headings; dense but airy tables.
- **Style**: minimalism, borderless-shadow cards in the dark theme (1px borders), 12px radii, no crypto gradient clichés. Status pills colored by phase: preparing = blue, deciding = amber, confirming = purple, approved = green, rejected = red.
- VARA numbers: abbreviated (1.5M VARA) with the full value in a tooltip; addresses: identicon + `kGg…X4z` truncation + copy; show the on-chain identity name when one exists.

### 7.2 Key screens
1. **/referenda** — the list: a summary strip on top (Ongoing N · Deciding M · Treasury spent Q VARA), status tabs, track filter. Card: number, title (or "[General Admin] Referendum #77"), track badge, status pill, aye/nay bar with percentages, "X left" until the phase ends, comment count.
2. **/referenda/[id]** — two columns (one on mobile): content on the left (title, author, description, decoded call in a collapsible block, comments), a sticky sidebar on the right (vertical status timeline: Submitted → Deciding → Confirming → Approved/Enactment with dates; tally card: aye/nay bar, support %, Vote button; the curves chart in a collapsible; deposits; track parameters).
3. **/new** — the wizard (§5), maximum plain-language explanation; every term (conviction, decision deposit, enactment) gets a "?" tooltip.
4. **/votes** (My votes) — a table of the connected account's votes: referendum, vote, conviction, lock status, remove/unlock actions.
5. **Header**: logo, Referenda, New proposal (accent button), wallet select/connect (modal: extension list, then accounts with balances).

### 7.3 UX principles
- Live tally/status updates via subscription — a pulsing "live" badge; no manual refresh anywhere.
- Every transaction: signing → in block → finalized states with toasts; RPC errors in human language, with retry.
- Loading skeletons, empty states with an illustration and a CTA ("No ongoing referenda — create the first one").
- All destructive/expensive actions get an explicit amount confirmation.
- Interface language: English (the audience is international), all strings in one dictionary for future localization.
- Responsive: a proper mobile view (mobile voting via Nova/SubWallet mobile deep-links — v2, but the layout is mobile-first).
- Accessibility: AA contrast, focus styles, aria on interactive elements.

## 8. Implementation plan (phases = milestones for Claude Code)

| Phase | Contents | Acceptance criteria |
|---|---|---|
| 0. Skeleton | Next.js + TS + Tailwind + shadcn, docker-compose (web+pg), RPC connection with fallbacks, ApiProvider, layout, dark/light themes | `next build` green; a live finalized-block number in the header |
| 1. Read-only explorer | list + details entirely from the live chain (fallback titles "[Track] Referendum #N"), phases, tally, curves, call decoder | all 78 referenda open; ongoing shows a live tally; curves match Subsquare |
| 2. Wallets + voting | extension connection, vote popup, removeVote, My votes, unlock | a vote via SubWallet lands on the live network and is visible in the tally |
| 3. DB + content + comments | Postgres/Prisma, SIMA title/description writes, setMetadata, comments with anti-spam | the author sets a title; a comment passes signature and min-balance checks |
| 4. Creation wizard | §5 in full, including the decision-deposit banner | a text proposal and a treasury spend created end-to-end on the live network |
| 5. Worker + backfill | listener with a cursor and catch-up, vote snapshots, 78-referenda backfill (+ optional title import) | a worker restart loses no events; closed referenda show final tallies and vote lists |
| 6. Polish | empty/error states, mobile layout, perf (bundle, RPC cache), VPS deploy, domain | Lighthouse ≥ 90; a production URL |

Phases 1–2 already yield a useful product with no DB at all — showable to the team.

### Checklist to verify at implementation start
- [ ] Does the runtime emit `convictionVoting.Voted/VoteRemoved` events (affects §1.3; if not — parse vote extrinsics, including batch/proxy).
- [ ] `preimage` deposits in consts (display in the wizard).
- [ ] The exact brand green from the Vara brand book.
- [ ] `referenda.setMetadata` is available to the proposer (documented in the pallet; confirm with a testnet transaction).
- [ ] The `Origins` enum variant name for every track (check against metadata).

## 9. Risks (recorded by the council)

| Risk | Mitigation |
|---|---|
| Worker misses events on a crash | cursor + catch-up via the archive node; idempotent writes; an alert when the cursor lags > 100 blocks |
| Public RPC degrades | a fallback list, auto-switching; a 1-block cache for live responses |
| Ledger lacks signRaw | limitation documented; on-chain actions still work |
| Comment spam | signature + min-balance + rate limit; raise the balance bar if it grows |
| Vara runtime upgrades (new tracks/fields) | everything is read from consts/metadata dynamically; nothing is hardcoded |
| Legal caution over importing old Subsquare titles | the step is optional, marked "imported", skippable |
