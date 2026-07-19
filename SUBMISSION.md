# THE FIXER — Technical Documentation

A quick, judge-facing overview: the core idea, the technical and business highlights, and the exact TxLINE endpoints the product uses.

- **Live app:** https://the-fix.vercel.app
- **Room server (API):** https://the-fixer.onrender.com — public health check: [`/api/fixtures`](https://the-fixer.onrender.com/api/fixtures)
- **Public repo:** https://github.com/Yashaswini-Singh02/the-fixer
- **Demo video:**
- **Network:** Solana **devnet** · TxLINE origin `https://txline-dev.txodds.com`

---

## Core idea

**THE FIXER** is a mobile-first, second-screen party game for **2–8 friends** watching the same football match. Players don't bet against the house or predict a final score — they compete with each other in real time, using the live match as a shared source of randomness. The match is divided into **15-minute segments**; each segment offers three sealed yes/no markets (**⚽ Goal · 🚩 Corners 2+ · 🟨 Card**), and real TxLINE match events settle them. Winners climb a shared 20-rung ladder.

The signature mechanic — **"fixing" a friend** — lets a player secretly sabotage a rival's segment for 2 coins, anonymously, with all fixes confessed at full time. This is a genuinely new fan-interaction model: social, competitive, and driven entirely by live pitch events rather than repackaging an existing odds feed.

## Why it fits the brief

- **Live TxLINE data as input:** goals, corners, cards, the clock, and odds all arrive from TxLINE score/odds streams. Replays pull the same match's archive. Nothing is mocked in production.
- **Solana signup:** the service is activated by a real on-chain subscription transaction to the TxLINE `txoracle` program, signed by a Solana wallet.
- **Live & functional, not a mockup:** deployed web app + room server, both reachable now. Prod runs `NEXT_PUBLIC_MOCK=0` against real data.
- **Reviewable without a live match:** because past matches replay from the archive at up to 10×, judges can start a finished match and watch the full live experience on demand — important since matches end before review.

## Technical highlights

- **Single code path for live / replay / tests.** Live streams, historical replays, and unit fixtures all normalize into the *same* event stream feeding the *same* pure reducer `reduce(state, event) → state`. A room cannot tell which source is attached, so behavior is deterministic and fully testable.
- **Server-enforced secrecy.** Sealed bets leave the server only as counts (never market/side/stake). A landed fix arrives *nameless* to everyone but the fixer. The complete who-fixed-whom truth is transmitted only when the game is finished. You cannot cheat by inspecting your device — the hidden data was never sent to it.
- **Crash-safe rooms.** Every room's event log is persisted to **Redis**; state is rebuilt by replaying the log through the same pure reducer, so a deploy or crash mid-match resumes cleanly.
- **Resilient live ingestion.** SSE consumption with `Last-Event-ID` resume, exponential backoff reconnect, an idle watchdog, and guest-JWT refresh on `401`.
- **Stack:** TypeScript pnpm monorepo — Fastify 5 + `@fastify/websocket` + ioredis + zod (server); Next.js 16 / React 19 / Tailwind / framer-motion, installable PWA (web); `@coral-xyz/anchor` + `@solana/web3.js` + `@solana/spl-token` for the on-chain subscription.

## Business & monetization path

The product is a **freemium social layer for live sports viewing** — the kind of thing a group already gathered around a match will open every matchday.

- **Freemium rooms:** free casual play; a paid tier unlocks bigger lobbies, private leagues/seasons, persistent standings, and custom segment lengths.
- **Cosmetics & identity:** avatars, ladder skins, celebration effects, and win fanfares — low-marginal-cost, high-engagement.
- **Sponsored segments:** a segment or market can be branded ("This corners market brought to you by …") — native, non-intrusive inventory during peak attention windows.
- **Rights-holder / broadcaster licensing:** white-label the second-screen experience for a league, club, or streaming platform to drive watch-time and retention.
- **On-chain foundation:** signup already runs through Solana + a TxLINE token subscription, so metered/tiered data access and tokenized seasonal competitions are a natural extension rather than a rebuild.

The unit economics are attractive: the match is the content, TxLINE is the data, and the players bring themselves — the marginal cost of an extra room is near zero.

---

## TxLINE endpoints used

Base API origin (devnet): `https://txline-dev.txodds.com`. Auth model: a durable **`x-api-token`** header (from activation) plus a short-lived guest **`Bearer` JWT** that is minted lazily and refreshed on `401`.

### On-chain (Solana devnet)

| What | Detail |
|---|---|
| **Subscribe** | Anchor instruction `subscribe(serviceLevelId, durationWeeks)` on the TxLINE **`txoracle`** program (devnet program id `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`). Creates the user's TXL token account (Token-2022 ATA, idempotent) and records the subscription. Returns the transaction signature used for activation. — `apps/server/src/txline/subscribe.ts` |

### HTTP / SSE

| Method | Path | Purpose | Source file |
|---|---|---|---|
| `POST` | `/auth/guest/start` | Mint a short-lived anonymous guest JWT (no credentials). Refreshed automatically on `401`. | `txline/auth.ts`, `txline/activate.ts` |
| `POST` | `/api/token/activate` | Trade a signed proof — `sign("{txSig}:{leagues}:{jwt}")` — for the durable `x-api-token`. Body `{ txSig, walletSignature, leagues }`, `Authorization: Bearer <jwt>`. | `txline/activate.ts` |
| `GET` | `/api/fixtures/snapshot` | Rolling list of current fixtures (id, participants, kickoff, competition). Polled and persisted into our own fixture index. | `fixtures/registry.ts` |
| `GET` | `/api/scores/stream` | **Live** score events (goals, corners, cards, status/clock) as SSE. Consumed with `Last-Event-ID` resume + backoff. | `rooms/drivers.ts` |
| `GET` | `/api/odds/stream` | **Live** odds updates as SSE, used to price the GOAL market sharply. | `rooms/drivers.ts` |
| `GET` | `/api/scores/historical/{fixtureId}` | Full archived score history for a finished match (SSE-format text), replayed at speed. Available roughly 6h–14d after kickoff. | `rooms/drivers.ts` |

> Note: TxLINE exposes **no historical odds** endpoint, so replayed matches price the GOAL market at neutral base rates (steeper after the 75th minute); live matches get sharp, moving goal odds from `/api/odds/stream`. Corners and cards are priced from static rates in both modes.

---
