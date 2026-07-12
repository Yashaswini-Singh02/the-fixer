import {
  initGame,
  reduce,
  type Bet,
  type EngineEvent,
  type GameState,
  type PublicGameState,
  type RoomView,
  type ServerMsg,
} from "@thefix/engine";

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

  constructor(
    readonly code: string,
    readonly fixture: RoomView["fixture"],
  ) {
    this.state = initGame(fixture.id);
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

    // odds ticks only refresh the pricing input for the NEXT segment open —
    // nothing a client renders changed, so don't storm the sockets
    if (ev.kind === "odds") return;

    // any segment that resolved during this event triggers a reveal.
    // the engine drops bets at resolve, so grab them from the segment that
    // was open going in — later same-event resolutions can't have had bets.
    for (const result of next.history.slice(prev.history.length)) {
      const bets: Bet[] =
        prev.segment?.index === result.index ? prev.segment.bets : [];
      this.broadcast({ type: "reveal", result, bets });
    }

    const wentLive = prev.status === "lobby" && next.status === "live";
    this.broadcastViews();
    if (wentLive) this.onLive?.();
  }

  /** Everything THIS player may see. */
  view(playerId: string): RoomView {
    const s = this.state;
    return {
      roomCode: this.code,
      fixture: this.fixture,
      you: playerId,
      state: redact(s),
      yourBets: (s.segment?.bets ?? [])
        .filter((b) => b.playerId === playerId)
        .map(({ market, side, stake }) => ({ market, side, stake })),
      yourFixTarget:
        s.segment?.fixes.find((f) => f.fixerId === playerId)?.targetId ?? null,
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

/** Strip per-player secrets from the shared state: bets -> counts, fixes -> total. */
function redact(s: GameState): PublicGameState {
  if (!s.segment) return { ...s, segment: null };
  const { bets, fixes, ...open } = s.segment;
  const betCounts: Record<string, number> = {};
  for (const b of bets) betCounts[b.playerId] = (betCounts[b.playerId] ?? 0) + 1;
  return { ...s, segment: { ...open, betCounts, fixCount: fixes.length } };
}
