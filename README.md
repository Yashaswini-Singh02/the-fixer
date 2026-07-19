# THE FIXER

> _Watch the match together. Bet the segments in secret. **Fix your friends** and climb the ladder._

**THE FIXER** is a mobile-first, second-screen party game for **2–8 friends** watching the same football match. You don't play against the match — you play against _each other_, using the live game on your TV as the dice. Real goals, corners, cards, and the match clock — streamed in from **[TxLINE](https://txline.txodds.com)** — decide who was right.

- **Live app:** https://the-fix.vercel.app
- **Room server (API):** https://the-fixer.onrender.com  · try [`/api/fixtures`](https://the-fixer.onrender.com/api/fixtures)
- **Player docs (GitBook):** see [`docs/gitbook`](docs/gitbook/README.md)
- **Technical / submission doc:** [`SUBMISSION.md`](SUBMISSION.md) — core idea, monetization, and the **full list of TxLINE endpoints used**

## How it plays

The match is chopped into **15-minute segments**. Each segment you get fresh coins and three quick yes/no questions — _goal? two corners? a card?_ Everyone bets **in secret**; you see only _that_ a friend bet, never _what_. When the segment ends, the real match settles it and winners climb a shared **20-rung ladder**.

The twist that names the game: at any moment you can spend 2 coins to secretly **fix a friend**. Their bad segment becomes your good one — and nobody knows it was you until full time, when every fix is confessed.

Past matches replay from the TxLINE archive at up to 10× speed, so a full match becomes a ~9-minute party round — which also means **judges can replay a finished match on demand**, even with no live game in progress.

## Built on TxLINE + Solana

Signup is a real **on-chain Solana subscription** to the TxLINE `txoracle` program (devnet), and every outcome in the game is read from **live TxLINE score + odds streams** (or the historical archive for replays). Nothing is faked or hard-coded.

TxLINE endpoints in use (full detail in [`SUBMISSION.md`](SUBMISSION.md)):

| Purpose | Call |
|---|---|
| Solana signup | on-chain `subscribe()` — `txoracle` program (devnet) |
| Guest auth | `POST /auth/guest/start` |
| Activate API token | `POST /api/token/activate` (wallet-signed) |
| Fixture list | `GET /api/fixtures/snapshot` |
| Live scores | `GET /api/scores/stream` (SSE) |
| Live odds | `GET /api/odds/stream` (SSE) |
| Replay archive | `GET /api/scores/historical/{fixtureId}` |

## Architecture

A pnpm monorepo with a deliberately strict shape — the whole design exists to protect one thing: **secrecy**.

| Package | Role |
|---|---|
| `packages/shared` | Normalized match-event types (goal, corner, card, clock, phase, odds). |
| `packages/engine` | The **pure** game engine: `reduce(state, event) → state`. No clock, no I/O, no randomness. Every tunable lives in one `config.ts`. |
| `apps/server` | A **Fastify** room server. Ingests TxLINE data, drives rooms, fans out a **redacted per-player view** over WebSocket. |
| `apps/web` | A **Next.js 16 / React 19** mobile-first PWA. Talks to the server through one socket seam. |

Live matches, historical replays, and unit tests all produce the **same normalized event stream** into the **same pure reducer** — a room can't tell whether a live feed or a replay is attached. Secrets never leave the server until they're meant to: sealed bets leave as counts, a landed fix arrives nameless to everyone but the fixer, and the full who-fixed-whom truth is sent only at full time. Rooms are persisted through **Redis**, so a crash or deploy doesn't drop a match in flight.

## Local development

```bash
pnpm install

# server (needs a .env — see .env.example)
pnpm serve

# web (in apps/web)
pnpm --filter @thefix/web dev
```

Copy `.env.example` to `.env` and fill in your TxLINE credentials. The web app runs against real data with `NEXT_PUBLIC_MOCK=0` (prod default); leave it unset for the offline mock socket. Set `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` to point the client at your server.

### One-time TxLINE onboarding

```bash
# 1. subscribe on-chain (Solana devnet) — prints a txSig
npx tsx apps/server/src/txline/subscribe.ts

# 2. trade the signed txSig for a durable API token
npx tsx apps/server/src/txline/activate.ts <txSig>
# → copy TXLINE_API_TOKEN into .env
```

## License

All rights reserved (hackathon submission).
