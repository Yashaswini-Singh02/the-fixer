import {
  guessThreshold,
  nextSegmentAllowance,
  type Bet,
  type ClientMsg,
  type GameState,
  type PublicGameState,
  type PublicPlayer,
  type PublicSegment,
  type RoomView,
  type ServerMsg,
  type YourGuess,
} from "@thefix/engine";
import type { Fixture } from "./fixtures";

/**
 * The single seam between UI and world. Every screen talks to a GameSocket and
 * nothing else — so the same components render against the scripted MockSocket
 * (demo-safe, drives the real engine) or the RealSocket (thin ws wrapper) with
 * no changes. NEXT_PUBLIC_MOCK picks which one `openRoom` returns.
 */
export interface GameSocket {
  send(msg: ClientMsg): void;
  subscribe(cb: (msg: ServerMsg) => void): () => void;
  close(): void;
}

/**
 * Server-authoritative projection: full GameState → the redacted view one
 * client is allowed to see. The real server does this too; the mock reuses it
 * so both paths produce identical RoomView shapes.
 */
export function projectView(
  state: GameState,
  you: string,
  roomCode: string,
  fixture: Fixture,
  /** wall-clock deadline (ms) of an open guess window; the socket owns it */
  guessDeadline: number | null = null,
): RoomView {
  let segment: PublicSegment | null = null;
  if (state.segment) {
    const betCounts: Record<string, number> = {};
    for (const b of state.segment.bets) {
      betCounts[b.playerId] = (betCounts[b.playerId] ?? 0) + 1;
    }
    const { bets: _b, fixes, ...rest } = state.segment;
    void _b;
    segment = { ...rest, betCounts, fixCount: fixes.length };
  }

  // strip `guessing` (holds true fixer ids) and each player's private
  // carry-over bookkeeping — same secrecy the real server enforces
  const { segment: _s, guessing, players, ...restState } = state;
  void _s;
  const publicState: PublicGameState = {
    ...restState,
    players: toPublicPlayers(players),
    segment,
  };

  const mine = state.segment?.bets ?? [];
  const yourBets = mine
    .filter((b) => b.playerId === you)
    .map((b) => ({ market: b.market, side: b.side, stake: b.stake }));
  const yourFixTarget =
    state.segment?.fixes.find((f) => f.fixerId === you)?.targetId ?? null;

  return {
    roomCode,
    fixture,
    you,
    state: publicState,
    yourBets,
    yourFixTarget,
    guess: buildGuess(state, guessing, you, guessDeadline),
    nextSegment: buildNextSegment(players[you]),
  };
}

/** Whitelist the public player fields — drop the pending carry-over so a landed
 *  (anonymous) fix's coin bonus can't be inferred from someone's pending state. */
function toPublicPlayers(
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

/** Your open guess window, if a fix landed on you — candidates only, no answer. */
function buildGuess(
  state: GameState,
  guessing: GameState["guessing"],
  you: string,
  deadline: number | null,
): YourGuess | null {
  if (!guessing) return null;
  const slot = guessing.slots.find((sl) => sl.victimId === you);
  if (!slot) return null;
  return {
    segmentIndex: guessing.segmentIndex,
    fixCount: slot.fixerIds.length,
    needed: guessThreshold(slot.fixerIds.length),
    candidates: Object.values(state.players)
      .filter((p) => p.id !== you)
      .map(({ id, name, emoji }) => ({ id, name, emoji })),
    deadline,
    submitted: slot.resolved,
    correct: slot.resolved ? slot.correct : null,
  };
}

/** Preview of your own next-segment allowance (14 / 5 / 12 + fix-lock), or null. */
function buildNextSegment(
  p: GameState["players"][string] | undefined,
): RoomView["nextSegment"] {
  if (!p) return null;
  if (!p.pendingHalve && p.pendingCoinBonus === 0 && !p.pendingFixLock) {
    return null;
  }
  return nextSegmentAllowance(p);
}

/** The mock captures a resolving segment's bets to hand back on reveal. */
export type RevealBets = Bet[];

let cachedMockMode: boolean | null = null;
export function isMockMode(): boolean {
  if (cachedMockMode !== null) return cachedMockMode;
  // default to the mock — the demo depends on it, and the server is optional
  cachedMockMode = process.env.NEXT_PUBLIC_MOCK !== "0";
  return cachedMockMode;
}

/**
 * Open a socket for a room. Lazily imports the chosen implementation so the
 * mock's scripted timeline never ships in a real-server build and vice-versa.
 */
export async function openRoom(roomCode: string): Promise<GameSocket> {
  if (isMockMode()) {
    const { MockSocket } = await import("./mockSocket");
    return new MockSocket(roomCode);
  }
  const { RealSocket } = await import("./realSocket");
  return new RealSocket(roomCode);
}
