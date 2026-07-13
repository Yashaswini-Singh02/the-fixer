# THE FIX — Handoff Document

_Last updated: 2026-07-13. Written for a teammate (or their agent) picking up the project cold._

---

## 1. What this app is

**THE FIX** is a mobile-first World Cup party game. Friends join a room with a 4-letter code, watch a real football match together, and bet secretly on 15-minute segments of that match — will there be a goal? 2+ corners? a card? Winning bets climb a 20-rung ladder; you can also pay 2 coins to secretly **fix** a friend. If they win nothing that segment your fix lands: you climb, and *nobody learns it was you until full time* (your extra rungs hide in plain sight among everyone's climbs). If they cash, it backfires: they get a bonus rung and you're exposed on the spot. First to the top — or highest at full time — wins, and the FT screen confesses every landed fix.

The match data is **real**: live matches stream from the TxLINE sports feed (devnet), and past matches replay from TxLINE's historical scores endpoint at configurable speed (20x compresses a 2-hour match into ~6 minutes).

### Game rules (as implemented in the engine)

| Rule | Value | Where |
|---|---|---|
| Coins per player per segment | 10 (unspent coins vanish) | `packages/engine/src/config.ts` |
| Segments | 1–6 regulation (15-min blocks), 7–8 extra time | `packages/engine/src/reducer.ts` `dueSegment` |
| Markets per segment | GOAL (1+), CORNERS (2+), CARD (1+) — Yes/No | `resolveSegment` |
| Stake window | 180 match-clock seconds from segment open, then sealed | `config.ts stakeWindowSec` |
| Climb | `round(stake × (payout − 1) / 3)`, min 1 (a win never climbs zero), capped 6 rungs/market | `config.ts` |
| Fix cost / backfire | 2 coins; backfire gives target +1 rung and names the fixer | `resolveSegment` |
| Fix secrecy | a **landed** fix stays anonymous (nameless in reveals, rungs hidden from the public climb sheet) until full time; all names come out on the FT "confessions" list | `room.ts redactResult`, `FullTime.tsx` |
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

**Secrecy is server-side**: sealed bets leave the server only as counts until the segment resolves; the `reveal` message unseals bets and backfired fixes, but each client gets its **own redacted cut** — a landed fix is nameless (`fixerId: null`) to everyone except the fixer, and the fixer's stolen rungs are removed from that cut's climb sheet. The full truth ships only once `status === "finished"` (the FT confessions).

### Server HTTP/WS API

- `GET  :8080/api/fixtures` → `[{id, home, away, kickoff, competition, kind}]` where `kind` ∈ `upcoming | live | past` (past = newest 3 within the historical window).
- `POST :8080/api/rooms` body `{fixtureId, speed?}` → `{roomCode, kind}`. Past fixtures fetch full history up front (fails 502 if unavailable); live/upcoming attach the live streams immediately. `speed` (default 20, clamp 1–100000) applies to past rooms only.
- `WS   :8080/ws` — client sends `hello {roomCode, playerId, name, emoji}` first, then `start | bet {market, side, stake} | fix {targetId} | react {emoji}`. Server sends `view {view}`, `reveal {result, bets}` (per-recipient: landed fixes arrive `fixerId: null` unless you placed them), `react`, `error {code, message}`. **Rejected commands (e.g. a bet after the seal) are silently dropped** — no error frame; see §6.

### TxLINE (data provider) facts — verified against devnet 2026-07-13

- Auth = **two headers together**: `authorization: Bearer <guest JWT>` + `x-api-token: <durable token>`. Guest JWTs are free and anonymous (`POST /auth/guest/start`, no body/credentials) and expire quickly. The durable token is in `.env` (`TXLINE_API_TOKEN`).
- `GET /api/fixtures/snapshot` — rolling window of current/upcoming fixtures. **Forgets a match within ~a day of kickoff**; do not rely on it for past matches.
- `GET /api/scores/historical/{fixtureId}` — full raw SSE-text scores history. **Retention: kickoff between 6 hours and 2 weeks ago.** This is everything the engine needs (goals/corners/cards/clock/phases).
- **There is NO historical odds endpoint** (verified: `/api/odds/historical/...` → 404; docs list only streams). Consequence: past-match rooms price GOAL at neutral base rates (engine handles `overP == null` gracefully). CORNERS/CARD never used live odds anyway.
- Live streams: `GET /api/scores/stream`, `GET /api/odds/stream` (SSE, resume via `Last-Event-ID`).
- API docs: `https://txline-dev.txodds.com/docs/` (Swagger), examples at `https://txline.txodds.com/documentation/examples/streaming-data`.

---

## 3. What was just done (2026-07-13 session)

Two waves of work in this session. First: **remove all hardcoded/recorded data from the product flow** — fixtures come from the API, past matches replay from the historical endpoint on demand, rooms are created through the backend. Second, after real playtesting: **gameplay & UX fixes** — the climb floor, fix anonymity until full time, and the celebration/ladder UI layer.

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
| **Climb floor**: every winning bet now climbs ≥1 rung (`rungFloorPerWin`). Previously `round(stake × (payout−1) / 3)` rounded to **zero** for 1–2 coin stakes at short odds, so a correct prediction could feel like nothing happened. | `packages/engine/src/config.ts`, `reducer.ts` |
| **UI polish & celebration layer**: the SEALED stamp no longer overlaps the bet pill (it's now a diagonal rubber-stamp across the odds); an un-staked side selection clears at the seal so it can't look like a placed bet; new `Celebration` component (confetti rain + dancing cat 🐈 + WebAudio chiptune fanfare — synthesized in-browser, zero audio assets/licensing) fires on any reveal where you climbed and in champion mode when you win at FT; the Ladder is redrawn as a real ladder (a line per rung, bolder every 5, per-lane rails, glowing progress trails, names, pulse ring + floating "+N" on climbs, "First to 20 🏆" summit). | `apps/web/src/components/MarketCard.tsx`, `Ladder.tsx`, `Celebration.tsx` (new), `RevealOverlay.tsx`, `screens/FullTime.tsx`, `apps/web/src/lib/winTune.ts` (new), `globals.css` |
| **Landed fixes are anonymous until full time**: reveals are now sent per-player, not broadcast — a landed fix arrives with `fixerId: null` (and the fixer's rungs stripped from the climb sheet) for everyone except the fixer. Backfires stay fully named. `state.history` inside views is redacted the same way while live; the finished state carries the truth, which FullTime shows as a "confessions" list. New types `PublicFixResult` / `PublicSegmentResult` in the protocol. | `apps/server/src/rooms/room.ts`, `packages/engine/src/protocol.ts`, `apps/web/src/components/RevealOverlay.tsx`, `apps/web/src/components/screens/FullTime.tsx`, `apps/web/src/hooks/useRoom.ts` |

### Verification already performed

- `pnpm test` — 29/29 pass (engine reducer incl. climb floor, normalizer against real recordings, per-viewer reveal redaction, full-pipeline bot sims of 3 real matches).
- `tsc --noEmit` clean for both apps.
- **Live end-to-end**: server booted against devnet, `GET /api/fixtures` returned real snapshot data (France–Spain & England–Argentina upcoming, Argentina–Switzerland past), `POST /api/rooms` created a historical room (1.4 MB history fetched with fresh guest JWT), and a scripted two-player game (`apps/server/scripts/e2e-room.mjs`) played all 8 segments: markets opened with prices, bets accepted then sealed, reveals matched the real match facts (Argentina 3-1 Switzerland, ET, cards), fixes resolved, winner declared at FT.
- **Fast-forward filter re-verified** (2026-07-13): after the "fast-forward to kickoff" filter landed in `server.ts`, a fresh e2e run (room MFC2, Argentina–Switzerland, speed 300) opened segment 1 **1.8 s after START** (previously ~72 s of dead air while the tape chewed through days of pre-match chatter). Full game completed: 8 segments, all markets priced, bets sealed/revealed, fixes resolved, winner declared.
- **Fix anonymity is pinned at the wire level**: `apps/server/test/room.test.ts` captures the serialized frames each fake socket receives and asserts the fixer's own reveal names them (`fixerId:"b"`), the target's cut is nameless (`fixerId:null`), the fixer's rungs are absent from the target's climb sheet, and the same redaction holds for `state.history` inside later views.
- **UI layer (stamp, ladder, celebration)**: `tsc` clean and hand-playtested in the browser by Yashaswini; there is no automated visual test — after UI edits, re-check §5 checklist items 3–5 and 8 by eye. The e2e script (`e2e-room.mjs`) also prints each bot's per-viewer fix cut (`fixes-as-<name>-sees-them`) for a no-browser anonymity check.

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
   - [ ] At the seal: SEALED rubber-stamps diagonally across each card **without covering your bet pill**; a side you highlighted but never staked un-highlights (it was never a bet)
   - [ ] Segment closes at the 15' boundary/whistle → RevealOverlay with outcomes, everyone's bets, ladder climbs; **any win climbs ≥1 rung** (tiny stakes included)
   - [ ] You climbed → confetti + dancing cat 🐈 + chiptune fanfare + "+N RUNGS!" (audio unlocks on your first tap — silent before that is normal)
   - [ ] Fix flow: 2 coins, secret target. **Backfire names the fixer; a landed fix shows "Someone fixed …" to everyone except the fixer** (fixer sees their own +N). No `fixerId` readable in the target's devtools either
   - [ ] HT/FT phases, ET segments 7–8 if the match went long, red-card slide
   - [ ] FullTime screen with winner (or tie), champion celebration if *you* won, "Most savage fix" award and **"The confessions" list naming every landed fix**
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

1. **The FT→kickoff+6h dead zone**: finished-but-not-yet-historical matches are offered as `live`. Options: use snapshot `GameState` to detect finished, hide the fixture for those hours, or label it "available at HH:MM".
2. **No historical odds → flat GOAL pricing in past rooms.** Suggestion: run a lightweight odds recorder (`pnpm record <odds-stream-url> <file>` already exists) whenever a tracked fixture is live, keyed by fixtureId; `POST /api/rooms` for a past fixture picks up the capture if present, else neutral pricing. That makes every match played *while the server was up* replayable with sharp prices.
3. **Rooms are in-memory only** — a server restart drops all rooms (players see the new "room not found" screen). `Room.log` already holds the full event history, so persistence = write log to disk/store, rebuild via `reduce` on boot. **Note: if this lands on Redis, that implementation is owned by Yashaswini — coordinate before writing any Redis code.**
4. **Cold-start naming**: the registry only knows fixtures seen in the snapshot since it first ran; the historical payload has team IDs but no names. Old matches (e.g. Norway–England QF, 18213979) can't be listed even though their history is still downloadable. If TxLINE has a participant-name lookup, wiring it in would close this; otherwise accept it.
5. **Late bets are rejected silently.** A bet/fix sent after the seal is dropped by the reducer and the server broadcasts nothing — the client never learns. At speed 20 the window is only 9 s, so humans hit this constantly and think the UI is broken. Fix: have `room.apply` (or the WS handler in `server.ts`) send an `error {code:"sealed"}` back to the sender when a command is rejected, and toast it in `MatchRoom`. The UI-side confusion (highlighted side ≠ placed bet) is already fixed; this is the missing server half.
6. **Kickoff display hides the date** — `apps/web/src/app/page.tsx kickoff()` formats weekday + time only, so a fixture two months out ("Australia v Brazil, Fri 8:30 PM" = Sep 25) looks like this week's match and reads as fake data. Show the date beyond ~6 days out.
7. **PENS phase mapping unobserved** — no shootout StatusIds have ever been seen on devnet (`normalize.ts STATUS_PHASE`). `100 → FT` fails soft if the final goes to pens; extend when real data appears.
8. **Sudden-death tiebreak** is TBD — exact rung tie leaves `winnerId: null` and the UI shows a tie.

**Still hardcoded (accepted / by design):**

- `packages/engine/src/config.ts` — all game-tuning constants (deliberate: single tuning surface, swept by the balance sim).
- Market resolution thresholds (goal ≥1, corners ≥2, card ≥1) and the odds filter (`OVERUNDER_PARTICIPANT_GOALS`, full match, `line=2.5`) in `reducer.ts`.
- `flagEmoji` / `COUNTRY_TINT` maps in `apps/web/src/lib/fixtures.ts` — ~10 countries; unknown teams get 🏳️ (cosmetic; add teams as they appear).
- Mock-mode fixture list + scripted match (`fixtures.ts`, `mockSocket.ts`) — mock-only by definition; never used when `NEXT_PUBLIC_MOCK=0`.
- Defaults: server port 8080 (`packages/engine/src/protocol.ts`), localhost URLs in web env fallbacks, replay speed 20, snapshot cache 5 min, SSE idle watchdog 5 min, room cap 8.
- `apps/server/src/txline/config.ts` — devnet/mainnet Solana program IDs + API origins (switch via `TXLINE_NETWORK`; mainnet untested by us).

**Hygiene suggestions:** no auth/rate-limit on the room API and `cors origin:true` (fine for a LAN party, not for public hosting); `apps/web/src/lib/room.ts newRoomCode` is now mock-only and could move; consider surfacing "history unavailable (502)" nicely in the landing page error banner (it already displays the message text); the mock demo (`mockSocket.ts`) emits unredacted results, so mock-mode reveals still name landed fixes — fine for a demo, just don't judge the anonymity feature there; the win fanfare is a synthesized chiptune (`winTune.ts`) — swapping in a real song means dropping a **licensed** audio file in `apps/web/public` and playing it instead.

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
apps/web/src/lib/winTune.ts        WebAudio chiptune win fanfare (no audio assets)
apps/web/src/hooks/useRoom.ts      WS state machine for all screens
apps/web/src/app/page.tsx          landing: fixture list → create/join room
apps/web/src/components/Ladder.tsx      the ladder: lanes, trails, +N climb pulses
apps/web/src/components/Celebration.tsx confetti + dancing cat + fanfare overlay
apps/web/src/components/RevealOverlay.tsx 3-act reveal (outcomes/bets/fixes)
apps/web/src/components/screens/FullTime.tsx podium, awards, confessions list
docs/FRONTEND_BRIEF.md             original UI brief
```
