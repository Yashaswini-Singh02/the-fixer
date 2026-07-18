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

export interface Conn {
  send(data: string): void;
}


export class Room {
  state: GameState;
  readonly log: EngineEvent[] = [];
  onLive?: () => void;
  private conns = new Map<Conn, string>();
  private guessTimer: ReturnType<typeof setTimeout> | undefined;
  private guessDeadline: number | null = null;

  constructor(
    readonly code: string,
    readonly fixture: RoomView["fixture"],
    stakeWindowSec?: number,
  ) {
    this.state = initGame(fixture.id, stakeWindowSec);
  }


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
    if (room.state.guessing) room.startGuessTimer();
    return room;
  }

  hello(conn: Conn, playerId: string, name: string, emoji: string): void {
    this.conns.set(conn, playerId);
    this.apply({ kind: "join", ts: Date.now(), playerId, name, emoji });
    // rejoin/spectate: apply may be a no-op, but this socket always gets a view
    this.sendTo(conn, { type: "view", view: this.view(playerId) });
  }

  detach(conn: Conn): void {
    this.conns.delete(conn);
  }

  react(playerId: string, emoji: string): void {
    this.broadcast({ type: "react", playerId, emoji });
  }

  apply(ev: EngineEvent): void {
    const prev = this.state;
    const next = reduce(prev, ev);
    if (next === prev) return; // rejected command or irrelevant event
    this.state = next;
    this.log.push(ev);
    persistEvent(this.code, ev);

    if (ev.kind === "odds") return;

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


function nextSegmentPreview(
  p: GameState["players"][string] | undefined,
): RoomView["nextSegment"] {
  if (!p) return null;
  if (!p.pendingHalve && p.pendingCoinBonus === 0 && !p.pendingFixLock) {
    return null;
  }
  return nextSegmentAllowance(p);
}

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
