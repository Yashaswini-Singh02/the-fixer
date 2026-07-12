# THE FIX — Handoff Document

_Last updated: 2026-07-13. Written for a teammate (or their agent) picking up the project cold._

---

## 1. What this app is

**THE FIX** is a mobile-first World Cup party game. Friends join a room with a 4-letter code, watch a real football match together, and bet secretly on 15-minute segments of that match — will there be a goal? 2+ corners? a card? Winning bets climb a 20-rung ladder; you can also pay 2 coins to secretly **fix** a friend (they win nothing that segment → you climb; they cash → it backfires and you're exposed). First to the top — or highest at full time — wins.

The match data is **real**: live matches stream from the TxLINE sports feed (devnet), and past matches replay from TxLINE's historical scores endpoint at configurable speed (20x compresses a 2-hour match into ~6 minutes).

### Game rules (as implemented in the engine)

| Rule | Value | Where |
|---|---|---|
| Coins per player per segment | 10 (unspent coins vanish) | `packages/engine/src/config.ts` |
| Segments | 1–6 regulation (15-min blocks), 7–8 extra time | `packages/engine/src/reducer.ts` `dueSegment` |
| Markets per segment | GOAL (1+), CORNERS (2+), CARD (1+) — Yes/No | `resolveSegment` |
| Stake window | 180 match-clock seconds from segment open, then sealed | `config.ts stakeWindowSec` |
| Climb | `round(stake × (payout − 1) / 3)`, capped 6 rungs/market | `config.ts` |
| Fix cost / backfire | 2 coins; backfire gives target +1 rung and reveals fixer | `resolveSegment` |
| Ladder top | 20 rungs → instant win | `config.ts ladderTop` |
| Red card | everyone above rung 10 slides down 1 | `reducer.ts` |
| Players | 2–8 per room; first to join is organizer | `reducer.ts` |

Payouts are fair odds (`1/p`, capped at 6.0, no margin), priced per segment by a Poisson model scaled by the live over/under 2.5 goals consensus (`packages/engine/src/pricing.ts`).

---

## 2. Architecture

pnpm monorepo:

```
packages/shared    — normalized StreamEvent types (goal/corner/card/clock/phase/odds)
packages/engine    — PURE game engine: reduce(state, event) → state. No clock, no I/O,
                     no randomness. Everything game-feel lives in config.ts.
apps/server        — Fastify room server :8080. Ingests TxLINE, drives rooms, fans out
                     redacted per-player views over WebSocket.
apps/web           — Next.js 16 mobile UI. Talks ONLY to a GameSocket seam
                     (MockSocket for demos, RealSocket → ws://:8080/ws for real play).
recordings/        — raw feed captures (gitignored; used by tests only, NOT by the app)
```

**The load-bearing decision (one code path):** live SSE, historical replay, and unit tests all produce the same normalized event stream into the same pure reducer. A room cannot tell whether a live driver or a historical driver is attached.

```
LIVE:  TxLINE /api/scores/stream + /api/odds/stream ──► driveLive ──┐
PAST:  TxLINE /api/scores/historical/{id} (fetched at room  ──► replayInto ──┤
       creation, replayed at N× speed)                                      │
                     ┌───────────────────────────────────────────────────────┘
                     ▼
        Normalizer (per fixture: dedupe by Seq, cumulative-score reconciliation,
        StatusId→phase, clock ticks)          apps/server/src/ingest/normalize.ts
                     ▼
        EngineEvents → reduce() → GameState   packages/engine/src/reducer.ts
                     ▼
        Room: redacts secrets (bets→counts, fixes→total), broadcasts per-player
        RoomView + reveal messages            apps/server/src/rooms/room.ts
                     ▼
        WebSocket clients (apps/web useRoom hook)
```

**Secrecy is server-side**: sealed bets leave the server only as counts until the segment resolves; the `reveal` message unseals everything at once.

### Server HTTP/WS API

- `GET  :8080/api/fixtures` → `[{id, home, away, kickoff, competition, kind}]` where `kind` ∈ `upcoming | live | past` (past = newest 3 within the historical window).
- `POST :8080/api/rooms` body `{fixtureId, speed?}` → `{roomCode, kind}`. Past fixtures fetch full history up front (fails 502 if unavailable); live/upcoming attach the live streams immediately. `speed` (default 20, clamp 1–100000) applies to past rooms only.
- `WS   :8080/ws` — client sends `hello {roomCode, playerId, name, emoji}` first, then `start | bet {market, side, stake} | fix {targetId} | react {emoji}`. Server sends `view {view}`, `reveal {result, bets}`, `react`, `error {code, message}`.

### TxLINE (data provider) facts — verified against devnet 2026-07-13

- Auth = **two headers together**: `authorization: Bearer <guest JWT>` + `x-api-token: <durable token>`. Guest JWTs are free and anonymous (`POST /auth/guest/start`, no body/credentials) and expire quickly. The durable token is in `.env` (`TXLINE_API_TOKEN`).
- `GET /api/fixtures/snapshot` — rolling window of current/upcoming fixtures. **Forgets a match within ~a day of kickoff**; do not rely on it for past matches.
- `GET /api/scores/historical/{fixtureId}` — full raw SSE-text scores history. **Retention: kickoff between 6 hours and 2 weeks ago.** This is everything the engine needs (goals/corners/cards/clock/phases).
- **There is NO historical odds endpoint** (verified: `/api/odds/historical/...` → 404; docs list only streams). Consequence: past-match rooms price GOAL at neutral base rates (engine handles `overP == null` gracefully). CORNERS/CARD never used live odds anyway.
- Live streams: `GET /api/scores/stream`, `GET /api/odds/stream` (SSE, resume via `Last-Event-ID`).
- API docs: `https://txline-dev.txodds.com/docs/` (Swagger), examples at `https://txline.txodds.com/documentation/examples/streaming-data`.

---

## 3. What was just done (2026-07-13 session)

Goal: **remove all hardcoded/recorded data from the product flow** — fixtures come from the API, past matches replay from the historical endpoint on demand, rooms are created through the backend.

| Change | File(s) |
|---|---|
| **JWT auto-refresh**: guest JWT minted lazily, re-minted on any 401. Stale `TXLINE_JWT` in `.env` no longer matters. | `apps/server/src/txline/auth.ts` (new) |
| **FixtureRegistry**: every fixture the snapshot ever shows is persisted to `apps/server/data/fixtures-seen.json` (gitignored). This is how we can list past matches the feed no longer names. `list()` = upcoming/live + newest 3 past; kinds computed from kickoff age (past = 6h–14d). The old `Competition === "World Cup"` filter was removed — all competitions are offered. | `apps/server/src/fixtures/registry.ts` (new) |
| **Historical room drive**: `POST /api/rooms` for a `past` fixture fetches `/api/scores/historical/{id}` at creation (fail-fast 502 if the feed can't serve it), fast-forwards to 10 min before kickoff, and replays through the normal pipeline when the organizer presses START. | `apps/server/src/server.ts`, `apps/server/src/rooms/drivers.ts` (`fetchHistoricalScores`, `replayInto`) |
| **Hardcoded `REPLAYS` table deleted** from the server; recordings are now used by tests only. | `apps/server/src/server.ts` |
| **Live-stream failures are no longer silent**: reconnects log a warning, and a 401 forces a fresh JWT on the next connect (previously it would retry an expired token forever with zero output). | `apps/server/src/rooms/drivers.ts` |
| **`parseSseText` extracted** so the historical HTTP response and file recordings share one parser. | `apps/server/src/replay.ts` |
| **Web landing page wired to the backend** (real mode): fetches `GET /api/fixtures`, renders Live/Coming up/"Replay the latest matches" sections, click → `POST /api/rooms` → navigate to the returned code. Mock mode keeps the old scripted demo untouched. | `apps/web/src/app/page.tsx`, `apps/web/src/lib/api.ts` (new) |
| **`room_not_found` now shows an error screen** instead of an infinite spinner; FullTime "rematch" routes home instead of to a dead locally-minted code. | `apps/web/src/hooks/useRoom.ts`, `apps/web/src/app/r/[code]/RoomClient.tsx` |

### Verification already performed

- `pnpm test` — 28/28 pass (engine reducer, normalizer against real recordings, room redaction, full-pipeline bot sims of 3 real matches).
- `tsc --noEmit` clean for both apps.
- **Live end-to-end**: server booted against devnet, `GET /api/fixtures` returned real snapshot data (France–Spain & England–Argentina upcoming, Argentina–Switzerland past), `POST /api/rooms` created a historical room (1.4 MB history fetched with fresh guest JWT), and a scripted two-player game (`apps/server/scripts/e2e-room.mjs`) played all 8 segments: markets opened with prices, bets accepted then sealed, reveals matched the real match facts (Argentina 3-1 Switzerland, ET, cards), fixes resolved, winner declared at FT.
- ⚠️ **One re-run pending**: the "fast-forward to kickoff" filter (last change in `server.ts`) was added *after* that e2e run and has not been re-verified. Re-run: `pnpm serve`, then `node apps/server/scripts/e2e-room.mjs <code>` per §5 — segment 1 should now open within seconds of START instead of ~1 minute.

---

## 4. How to run

### Prereqs

- Node ≥ 22 (repo developed on 26), pnpm. `pnpm install` at root.
- `.env` at repo root (already present, gitignored):
  - `TXLINE_API_TOKEN` — **required** for anything live/historical (durable).
  - `TXLINE_API_ORIGIN` — defaults to devnet `https://txline-dev.txodds.com`.
  - `TXLINE_JWT` — optional now; auto-minted/refreshed at runtime.
  - `TXLINE_NETWORK` — `devnet` (default) | `mainnet`; only used by the Solana-side scripts in `apps/server/src/txline/`.

### Start everything (real mode)

```bash
pnpm serve                         # room server on :8080 (from repo root)

cd apps/web
echo "NEXT_PUBLIC_MOCK=0" > .env.local   # once; real mode is NOT the default!
pnpm dev                           # web on :3000
```

Frontend env (all baked in when `next dev` starts — restart after changing):
- `NEXT_PUBLIC_MOCK=0` — use the real server. **Without this you get the scripted in-browser demo** (bots Priya/Rahul/Sam, fake Norway–England match) and nothing touches the backend.
- `NEXT_PUBLIC_API_URL` — default `http://localhost:8080`.
- `NEXT_PUBLIC_WS_URL` — default `ws://localhost:8080/ws`. Set both to `http(s)://<lan-ip>...` to test from a phone.

### Getting two players (required to start a game)

Identity (`playerId`) lives in browser localStorage — **two tabs in one browser are the same player**. Use a normal window + incognito, two browsers, or a phone on the LAN.

---

## 5. Testing against a PAST event (full match-functionality check)

1. `pnpm serve` — boot log prints how many past/current fixtures are known.
2. `curl -s localhost:8080/api/fixtures | jq` — expect `kind:"past"` entries (newest 3 matches that kicked off 6h–14d ago and were seen in the snapshot).
3. Create a room — **choose speed for what you're testing** (stake window = 180 match-seconds ÷ speed of wall time!):
   - UX/betting test: `speed 2–4` → 45–90s betting windows.
   - Party default: `20` → ~6-min match, ~9s windows.
   - Smoke test: `300+` → match in ~1 min, windows sub-second (only scripts can bet).
   ```bash
   curl -s -X POST localhost:8080/api/rooms \
     -H 'content-type: application/json' \
     -d '{"fixtureId":"<past id from step 2>","speed":4}'
   ```
   (Or just click the match under "Replay the latest matches" on `localhost:3000` — same call, default speed 20.)
4. Open `localhost:3000/r/<CODE>` as two players, press **Kick off**.
5. Checklist while it runs:
   - [ ] Segment 1 opens shortly after START (players get 10 coins; GOAL/CORNERS/CARD cards show prices)
   - [ ] Opponent's picks invisible until reveal (only bet *counts* show)
   - [ ] Stake window seals; segment closes at the 15' boundary/whistle → RevealOverlay with outcomes, everyone's bets, fix results, ladder climbs
   - [ ] Fix flow: 2 coins, secret target, backfire exposes the fixer
   - [ ] HT/FT phases, ET segments 7–8 if the match went long, red-card slide
   - [ ] FullTime screen with winner (or tie) at FT / rung 20
   - [ ] GOAL price is *neutral-constant* (~p 0.36, rising ~0.43 from 75') — expected, see §6 odds limitation
6. Scripted alternative (no browsers): `node apps/server/scripts/e2e-room.mjs <CODE>` runs two bot players end-to-end and logs segments/prices/reveals/winner.
7. Backend-only sanity (no server): `pnpm test` replays real recordings through the whole pipeline deterministically.

## Testing against a LIVE event (match day)

1. **Before kickoff**: `curl -s localhost:8080/api/fixtures | jq` — the match must appear (it enters the snapshot days ahead; the registry remembers it from then on).
2. Create the room any time before/at kickoff (click it in the UI, or POST without `speed`). `driveLive` attaches immediately — lobby shows the score while friends join. Segment 1 opens on the first H1 clock event.
3. Watch the server logs: stream reconnect warnings now print. A one-off `401` warning followed by recovery is the JWT refresh working; *repeated* 401s mean the durable `TXLINE_API_TOKEN` itself has died — re-run the activation flow (`apps/server/src/txline/activate.ts`).
4. Expected quiet-period behavior: the 5-min idle watchdog reconnects during halftime — harmless, by design.
5. Live odds should flow: GOAL prices will differ segment-to-segment (unlike past rooms). If they look neutral-constant, the over/under 2.5 full-match line isn't matching (`reducer.ts` odds filter) — log the incoming `SuperOddsType/MarketParameters` and adjust.
6. Timing edge: a match older than 6h but younger than… nothing — between FT and kickoff+6h a finished match still shows `kind:"live"` (historical isn't available yet). A room created there will sit on the final score and never progress. Known gap, see §6.

---

## 6. Remaining work / known limitations / suggestions

**Functional gaps (ordered by suggested priority):**

1. **Re-verify the kickoff fast-forward** (see §3 ⚠️).
2. **The FT→kickoff+6h dead zone**: finished-but-not-yet-historical matches are offered as `live`. Options: use snapshot `GameState` to detect finished, hide the fixture for those hours, or label it "available at HH:MM".
3. **No historical odds → flat GOAL pricing in past rooms.** Suggestion: run a lightweight odds recorder (`pnpm record <odds-stream-url> <file>` already exists) whenever a tracked fixture is live, keyed by fixtureId; `POST /api/rooms` for a past fixture picks up the capture if present, else neutral pricing. That makes every match played *while the server was up* replayable with sharp prices.
4. **Rooms are in-memory only** — a server restart drops all rooms (players see the new "room not found" screen). `Room.log` already holds the full event history, so persistence = write log to disk/store, rebuild via `reduce` on boot. **Note: if this lands on Redis, that implementation is owned by Yashaswini — coordinate before writing any Redis code.**
5. **Cold-start naming**: the registry only knows fixtures seen in the snapshot since it first ran; the historical payload has team IDs but no names. Old matches (e.g. Norway–England QF, 18213979) can't be listed even though their history is still downloadable. If TxLINE has a participant-name lookup, wiring it in would close this; otherwise accept it.
6. **PENS phase mapping unobserved** — no shootout StatusIds have ever been seen on devnet (`normalize.ts STATUS_PHASE`). `100 → FT` fails soft if the final goes to pens; extend when real data appears.
7. **Sudden-death tiebreak** is TBD — exact rung tie leaves `winnerId: null` and the UI shows a tie.

**Still hardcoded (accepted / by design):**

- `packages/engine/src/config.ts` — all game-tuning constants (deliberate: single tuning surface, swept by the balance sim).
- Market resolution thresholds (goal ≥1, corners ≥2, card ≥1) and the odds filter (`OVERUNDER_PARTICIPANT_GOALS`, full match, `line=2.5`) in `reducer.ts`.
- `flagEmoji` / `COUNTRY_TINT` maps in `apps/web/src/lib/fixtures.ts` — ~10 countries; unknown teams get 🏳️ (cosmetic; add teams as they appear).
- Mock-mode fixture list + scripted match (`fixtures.ts`, `mockSocket.ts`) — mock-only by definition; never used when `NEXT_PUBLIC_MOCK=0`.
- Defaults: server port 8080 (`packages/engine/src/protocol.ts`), localhost URLs in web env fallbacks, replay speed 20, snapshot cache 5 min, SSE idle watchdog 5 min, room cap 8.
- `apps/server/src/txline/config.ts` — devnet/mainnet Solana program IDs + API origins (switch via `TXLINE_NETWORK`; mainnet untested by us).

**Hygiene suggestions:** no auth/rate-limit on the room API and `cors origin:true` (fine for a LAN party, not for public hosting); `apps/web/src/lib/room.ts newRoomCode` is now mock-only and could move; consider surfacing "history unavailable (502)" nicely in the landing page error banner (it already displays the message text).

---

## 7. File map (where to look for what)

```
packages/engine/src/reducer.ts     game rules: segments, betting, fixes, resolution
packages/engine/src/pricing.ts     Poisson pricing, odds scaling
packages/engine/src/config.ts      ALL tunable constants
packages/engine/src/protocol.ts    ClientMsg/ServerMsg/RoomView wire types, port
packages/shared/src/events.ts      normalized StreamEvent types
apps/server/src/server.ts          HTTP+WS wiring, room creation, drive selection
apps/server/src/fixtures/registry.ts  persisted fixture index (snapshot memory)
apps/server/src/txline/auth.ts     guest-JWT mint/refresh + authed fetch
apps/server/src/rooms/room.ts      authoritative state, redaction, fan-out
apps/server/src/rooms/drivers.ts   driveLive (SSE) / fetchHistoricalScores+replayInto
apps/server/src/ingest/normalize.ts raw TxLINE → engine events (the tricky bits)
apps/server/src/replay.ts          SSE/ndjson/json parsing, merge, paced replay
apps/server/src/recorder.ts        CLI: capture any SSE stream to ndjson
apps/server/src/replay-cli.ts      CLI: print a recording's normalized timeline
apps/server/scripts/e2e-room.mjs   scripted 2-player end-to-end game vs :8080
apps/web/src/lib/api.ts            REST client (fixtures, create room)
apps/web/src/lib/socket.ts         GameSocket seam; NEXT_PUBLIC_MOCK switch
apps/web/src/hooks/useRoom.ts      WS state machine for all screens
apps/web/src/app/page.tsx          landing: fixture list → create/join room
docs/FRONTEND_BRIEF.md             original UI brief
```
