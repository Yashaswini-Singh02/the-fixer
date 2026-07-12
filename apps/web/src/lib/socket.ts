import type {
  Bet,
  ClientMsg,
  GameState,
  PublicGameState,
  PublicSegment,
  RoomView,
  ServerMsg,
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

  const { segment: _s, ...restState } = state;
  void _s;
  const publicState: PublicGameState = { ...restState, segment };

  const mine = state.segment?.bets ?? [];
  const yourBets = mine
    .filter((b) => b.playerId === you)
    .map((b) => ({ market: b.market, side: b.side, stake: b.stake }));
  const yourFixTarget =
    state.segment?.fixes.find((f) => f.fixerId === you)?.targetId ?? null;

  return { roomCode, fixture, you, state: publicState, yourBets, yourFixTarget };
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
