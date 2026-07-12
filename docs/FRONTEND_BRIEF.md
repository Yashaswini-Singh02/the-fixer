# Frontend Agent Brief — THE FIX

You are the **frontend agent** for The Fix, a mobile-first PWA party game for the
TxLINE World Cup hackathon (deadline **July 19, submit July 18**). A second agent
(the "server agent") is working in this same repo simultaneously on the game
engine and room server. This document is your contract — follow it.

## What the game is (60 seconds)

2–8 friends join a room via link while watching a World Cup match on TV. The
match divides into six 15-minute segments. Each segment: every player gets 10
coins, three Yes/No markets open (⚽ Goal this segment? 🚩 2+ corners? 🟨 Any
card?) with live odds-derived payouts. Bets are **sealed** — nobody sees what
friends picked. Anyone can secretly pay 2 coins to **"fix" a friend**: if that
friend wins nothing this segment, the fixer climbs; if the friend wins anything,
the fix backfires (+1 to the friend, fixer's identity exposed). Winnings climb a
shared 20-rung ladder. First to the top — or highest at full time — wins.
The segment reveal (bets unsealed → ladder animates → fixes exposed) is the
shared scream moment; make it feel like one.

## Hard boundaries (parallel-work rules)

- **You work ONLY inside `apps/web/`.** Never edit `apps/server`,
  `packages/engine`, `packages/shared`, `recordings/`, or root configs
  (importing/reading them is fine and encouraged).
- **Never touch or print `.env`** — it holds live API credentials.
- Add npm deps only to `apps/web` (`cd apps/web && pnpm add …`).
- The wire protocol lives in `packages/engine/src/protocol.ts` — **import it,
  never redefine it, never edit it**. If it blocks you, note what you need in
  `docs/PROTOCOL_REQUESTS.md` and build around it with your mock meanwhile.
- Do not run `git commit` unless the human asks.

## Stack & scaffold (your first task)

```bash
cd <repo root>
pnpm create next-app@latest apps/web --ts --tailwind --app --src-dir --import-alias "@/*" --use-pnpm
```

Then:
1. In `apps/web/package.json`: rename package to `"@thefix/web"`, add
   `"@thefix/engine": "workspace:*"` to dependencies.
2. In `next.config.ts`: `transpilePackages: ["@thefix/engine", "@thefix/shared"]`.
3. `pnpm install` at repo root.
4. Dev server: `pnpm --filter @thefix/web dev` → http://localhost:3000
   (the room server will be on :8080 — never claim that port).

Allowed extra deps: `framer-motion` (reveal animations), `clsx`. Avoid UI kits —
hand-rolled Tailwind reads better for judges. PWA: a `manifest.json` +
icons + installability is enough; no service-worker complexity unless free.

## The contract you build against

Types: `import type { RoomView, ClientMsg, ServerMsg, PublicGameState } from "@thefix/engine"`
Also useful: `CONFIG.ladderTop` (20), `CONFIG.segmentAllowance` (10),
`CONFIG.fixCost` (2), `MARKETS`.

Transport (when server lands): `ws://localhost:8080/ws`, JSON messages.
REST: `GET :8080/api/fixtures`, `POST :8080/api/rooms {fixtureId}` → `{roomCode}`.

**The server does not exist yet. Build a mock first** — this is your key
architectural move:

```ts
// apps/web/src/lib/socket.ts
export interface GameSocket {
  send(msg: ClientMsg): void;
  subscribe(cb: (msg: ServerMsg) => void): () => void;
}
```

Implement `MockSocket` (scripted timeline: lobby → segment opens → you bet →
seal → a goal → reveal → next segment → … → full time) and later `RealSocket`
(thin ws wrapper, auto-reconnect, re-`hello` on reconnect). A
`NEXT_PUBLIC_MOCK=1` env flag switches them. Every screen must work fully on
the mock — the demo may depend on it.

Identity: generate a `playerId` (uuid) once, persist in `localStorage`
alongside name + avatar emoji. Room code arrives via URL: `/r/[code]`.

## The 5 screens (build in this order: 3 → 4 → 2 → 1 → 5)

1. **Landing / Create** (`/`) — pick a fixture (or "Replay a classic"), tap
   create → get `/r/CODE` link + native share. Minimal.
2. **Lobby** (`/r/[code]` pre-start) — name + emoji picker on first visit,
   player list fills live, rules in 4 illustrated lines, organizer gets START.
3. **Match Room** (`/r/[code]` live) — THE screen, phone-portrait:
   - Ladder center-stage: 20 rungs, player avatars climb it (animate rung
     changes), rung numbers visible.
   - Score/clock strip top (from `state.counts`, `state.clockSec`, `state.phase`).
   - Current segment's 3 market cards: question, live YES x.x× / NO x.x×
     payouts, tap YES/NO then stake via quick chips (1/2/5/all-in) —
     sends `{type:"bet"}`. Your bets shown; coins remaining prominent.
   - Other players: avatar row with sealed-bet indicators (`betCounts`) and
     "N fixes placed 👀" (`fixCount`).
   - **Fix flow: long-press an avatar → 🔨 confirm** (costs 2 coins) —
     sends `{type:"fix"}`. Your current target marked (only for you).
   - Stake window countdown (`segment.openClock + 180 − state.clockSec`);
     when `segment.sealed`, lock inputs ("bets sealed 🤐").
   - Emoji reaction bar; incoming `react` msgs float up and fade.
4. **Segment Reveal** — full-screen takeover on `reveal` msg, ~3 acts:
   outcomes land (⚽ GOAL: YES) → all bets unsealed per player → ladder
   animates climbs → fixes exposed ("Priya fixed Rahul… and Rahul LOST 🔨").
   Big type, staged timing, framer-motion. This is the demo money shot.
5. **Full-time / Share** — winner podium, best call, most savage fix (derive
   from `state.history`), share-card image (html-to-canvas or styled DOM),
   "rematch next fixture" button.

Design: dark stadium-night palette, one hot accent, huge numerals, everything
thumb-reachable, 390px-first. Second-screen app: glanceable > dense.

## Mock data starter

A real fixture for your mock: `{ id: "18213979", home: "Norway", away:
"England", competition: "World Cup", kickoff: 1783803600000 }`. Realistic
prices for a segment: GOAL yes 2.76 / no 1.57, CORNERS yes 1.97 / no 2.03,
CARD yes 2.54 / no 1.65.

## Definition of done (your lane)

Every screen navigable and demo-able on MockSocket on a phone-sized viewport;
`RealSocket` written and behind the flag; no type errors (`pnpm -r exec tsc
--noEmit` passes for apps/web); no edits outside `apps/web` + the two docs
files named above.
