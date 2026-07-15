import {
  CONFIG,
  guessThreshold,
  initGame,
  nextSegmentAllowance,
  reduce,
  type Bet,
  type EngineEvent,
  type GameState,
  type PublicFixResult,
  type PublicGameState,
  type PublicPlayer,
  type PublicSegmentResult,
  type RoomView,
  type SegmentResult,
  type ServerMsg,
  type YourGuess,
} from "@thefix/engine";
import { persistEvent } from "../redis.js";

/** Anything that can receive a serialized ServerMsg (ws socket, test fake). */
export interface Conn {
  send(data: string): void;
}

/**
 * One live game room: holds the authoritative GameState, runs every event
 * through the pure reducer, and fans out per-player redacted views.
 *
 * Secrecy is enforced HERE, not in the client: sealed bets leave the server
 * only as counts, fixes only as a total, until the segment resolves and the
 * reveal message unseals everything at once.
 */
export class Room {
  state: GameState;
  /** full event history — replaying this through `reduce` rebuilds `state` */
  readonly log: EngineEvent[] = [];
  /** fires once when the organizer starts the game (drivers hook this) */
  onLive?: () => void;

  private conns = new Map<Conn, string>();

  // ── guess window (wall clock lives HERE, never in the pure engine) ──
  /** 30s countdown that injects guessWindowClosed when a guess window is open */
  private guessTimer: ReturnType<typeof setTimeout> | undefined;
  /** epoch ms the current window shuts, surfaced to clients for the countdown */
  private guessDeadline: number | null = null;

  constructor(
    readonly code: string,
    readonly fixture: RoomView["fixture"],
  ) {
    this.state = initGame(fixture.id);
  }

  /**
   * Rebuild a room from its persisted event log. Folds every event straight
   * through `reduce` — NOT apply() — so rehydration doesn't re-broadcast and,
   * crucially, doesn't re-persist the log back into Redis. Sockets reattach
   * later via hello() and pick up a fresh view then.
   */
  static rehydrate(
    code: string,
    fixture: RoomView["fixture"],
    log: EngineEvent[],
  ): Room {
    const room = new Room(code, fixture);
    for (const ev of log) {
      room.state = reduce(room.state, ev);
      room.log.push(ev);
    }
    // If the crash happened mid-guess-window, the folded state still has an
    // open `guessing` block — but the 30s timer that closes it lived only in
    // the old process's memory, never in the Redis log. Without this, the
    // segment machine would stay frozen forever. Start a fresh window so it
    // still closes (and any un-submitted guesses simply expire).
    if (room.state.guessing) room.startGuessTimer();
    return room;
  }

  /** Attach a socket as playerId; joins the game if still in lobby. */
  hello(conn: Conn, playerId: string, name: string, emoji: string): void {
    this.conns.set(conn, playerId);
    this.apply({ kind: "join", ts: Date.now(), playerId, name, emoji });
    // rejoin/spectate: apply may be a no-op, but this socket always gets a view
    this.sendTo(conn, { type: "view", view: this.view(playerId) });
  }

  detach(conn: Conn): void {
    this.conns.delete(conn);
  }

  /** Reactions bypass the engine — pure social broadcast, no game state. */
  react(playerId: string, emoji: string): void {
    this.broadcast({ type: "react", playerId, emoji });
  }

  /** Run one event through the engine; broadcast reveals + fresh views. */
  apply(ev: EngineEvent): void {
    const prev = this.state;
    const next = reduce(prev, ev);
    if (next === prev) return; // rejected command or irrelevant event
    this.state = next;
    this.log.push(ev);
    // mirror every accepted event into Redis so a crash/deploy can rebuild
    // this room. fire-and-forget (see redis.ts) — a dead Redis can't stall
    // the match, and this sits BEFORE the odds early-return on purpose so
    // odds ticks are persisted too, or the rebuilt pricing would drift.
    persistEvent(this.code, ev);

    // odds ticks only refresh the pricing input for the NEXT segment open —
    // nothing a client renders changed, so don't storm the sockets
    if (ev.kind === "odds") return;

    // any segment that resolved during this event triggers a reveal.
    // the engine drops bets at resolve, so grab them from the segment that
    // was open going in — later same-event resolutions can't have had bets.
    // landed fixes stay anonymous until full time, so every player gets
    // their own cut of the reveal (the fixer still sees their handiwork)
    for (const result of next.history.slice(prev.history.length)) {
      const bets: Bet[] =
        prev.segment?.index === result.index ? prev.segment.bets : [];
      for (const [conn, playerId] of this.conns) {
        this.sendTo(conn, {
          type: "reveal",
          result: redactResult(result, playerId),
          bets,
        });
      }
    }

    // start/stop the 30s guess-window clock as the engine opens/closes it —
    // done BEFORE broadcasting so the fresh deadline rides out on this view
    this.syncGuessWindow(prev, next);

    const wentLive = prev.status === "lobby" && next.status === "live";
    this.broadcastViews();
    if (wentLive) this.onLive?.();
  }

  /** Reconcile the wall-clock timer with the engine's guess-window state. */
  private syncGuessWindow(prev: GameState, next: GameState): void {
    if (prev.guessing && !next.guessing) {
      this.clearGuessTimer(); // engine closed it (window done, or game over)
      return;
    }
    if (!prev.guessing && next.guessing) {
      this.startGuessTimer(); // a fix landed — open the 30s window
      return;
    }
    // still open: if everyone named their fixer, shut it early
    if (next.guessing?.slots.every((sl) => sl.resolved)) this.closeGuessWindow();
  }

  private startGuessTimer(): void {
    this.clearGuessTimer();
    this.guessDeadline = Date.now() + CONFIG.guessWindowSec * 1000;
    this.guessTimer = setTimeout(
      () => this.closeGuessWindow(),
      CONFIG.guessWindowSec * 1000,
    );
    // don't let this pending timer keep the process (or a test runner) alive
    this.guessTimer.unref?.();
  }

  /** Inject guessWindowClosed so the engine unfreezes and opens the next
   *  segment (this event is persisted + replayed like any other). */
  private closeGuessWindow(): void {
    this.clearGuessTimer();
    if (this.state.guessing) {
      this.apply({ kind: "guessWindowClosed", ts: Date.now() });
    }
  }

  private clearGuessTimer(): void {
    if (this.guessTimer) clearTimeout(this.guessTimer);
    this.guessTimer = undefined;
    this.guessDeadline = null;
  }

  /** This player's open guess window, if a fix landed on them this reveal.
   *  Carries only what they may see — never the true fixer ids. */
  private guessFor(playerId: string): YourGuess | null {
    const g = this.state.guessing;
    if (!g) return null;
    const slot = g.slots.find((sl) => sl.victimId === playerId);
    if (!slot) return null;
    return {
      segmentIndex: g.segmentIndex,
      fixCount: slot.fixerIds.length,
      needed: guessThreshold(slot.fixerIds.length),
      candidates: Object.values(this.state.players)
        .filter((p) => p.id !== playerId)
        .map(({ id, name, emoji }) => ({ id, name, emoji })),
      deadline: this.guessDeadline,
      submitted: slot.resolved,
      correct: slot.resolved ? slot.correct : null,
    };
  }

  /** Everything THIS player may see. */
  view(playerId: string): RoomView {
    const s = this.state;
    return {
      roomCode: this.code,
      fixture: this.fixture,
      you: playerId,
      state: redact(s, playerId),
      yourBets: (s.segment?.bets ?? [])
        .filter((b) => b.playerId === playerId)
        .map(({ market, side, stake }) => ({ market, side, stake })),
      yourFixTarget:
        s.segment?.fixes.find((f) => f.fixerId === playerId)?.targetId ?? null,
      guess: this.guessFor(playerId),
      nextSegment: nextSegmentPreview(s.players[playerId]),
    };
  }

  broadcastViews(): void {
    for (const [conn, playerId] of this.conns) {
      this.sendTo(conn, { type: "view", view: this.view(playerId) });
    }
  }

  private broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const conn of this.conns.keys()) {
      try {
        conn.send(data);
      } catch {
        /* dying socket — its close handler detaches it */
      }
    }
  }

  private sendTo(conn: Conn, msg: ServerMsg): void {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      /* ditto */
    }
  }
}

/** Strip per-player secrets from the shared state: bets -> counts, fixes ->
 *  total, past segments keep landed fixes anonymous until full time, and two
 *  more things vanish that would otherwise out a landed (anonymous) fix — the
 *  whole `guessing` block (it holds the true fixer ids) and every player's
 *  carry-over bookkeeping (a +coin bonus would betray who pulled off a job). */
function redact(s: GameState, viewerId: string): PublicGameState {
  const history: PublicSegmentResult[] =
    s.status === "finished"
      ? s.history
      : s.history.map((r) => redactResult(r, viewerId));
  const { guessing: _g, segment, players, history: _h, ...rest } = s;
  const base = { ...rest, players: publicPlayers(players), history };
  if (!segment) return { ...base, segment: null };
  const { bets, fixes, ...open } = segment;
  const betCounts: Record<string, number> = {};
  for (const b of bets) betCounts[b.playerId] = (betCounts[b.playerId] ?? 0) + 1;
  return { ...base, segment: { ...open, betCounts, fixCount: fixes.length } };
}

/** Whitelist the fields a player exposes — the private carry-over bookkeeping
 *  (pendingHalve / pendingCoinBonus / pendingFixLock) is left out, so a landed
 *  fix's coin reward can't be inferred. Explicit by design: a future secret
 *  field on Player won't leak by default, it'll fail the PublicPlayer type. */
function publicPlayers(
  players: GameState["players"],
): Record<string, PublicPlayer> {
  const out: Record<string, PublicPlayer> = {};
  for (const [id, p] of Object.entries(players)) {
    out[id] = {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      rung: p.rung,
      coins: p.coins,
      fixLocked: p.fixLocked,
    };
  }
  return out;
}

/** Preview of a player's OWN next-segment carry-over for their view (14 / 5 /
 *  12, and whether they're fix-locked), or null when the plain allowance holds.
 *  Reads their real (unstripped) pending state — this only goes to that player. */
function nextSegmentPreview(
  p: GameState["players"][string] | undefined,
): RoomView["nextSegment"] {
  if (!p) return null;
  if (!p.pendingHalve && p.pendingCoinBonus === 0 && !p.pendingFixLock) {
    return null;
  }
  return nextSegmentAllowance(p);
}

/** A landed fix is nameless to everyone but its fixer, and its rungs leave
 *  the public climb sheet — the ladder still moves, and that ambiguity is
 *  the game. Backfires stay fully named; that's the punishment. */
function redactResult(
  r: SegmentResult,
  viewerId: string,
): PublicSegmentResult {
  const climbs = { ...r.climbs };
  const fixes: PublicFixResult[] = r.fixes.map((f) => {
    if (!f.succeeded || f.fixerId === viewerId) return { ...f };
    const left = (climbs[f.fixerId] ?? 0) - f.rungs;
    if (left > 0) climbs[f.fixerId] = left;
    else delete climbs[f.fixerId];
    return { ...f, fixerId: null };
  });
  return { ...r, climbs, fixes };
}
