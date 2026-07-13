import type {
  Bet,
  BetSide,
  FixResult,
  GameState,
  MarketKind,
  Segment,
  SegmentResult,
} from "./types.js";

/**
 * Wire protocol between room server and PWA client.
 * THE CONTRACT for parallel front/back development — both sides import
 * these types. Server is authoritative; clients render views and send
 * commands. Protocol changes go through the server agent only.
 */

/** Segment as non-owners see it: bets sealed, only indicators visible. */
export interface PublicSegment
  extends Omit<Segment, "bets" | "fixes"> {
  /** how many bets each player has placed (the sealed-bet indicators) */
  betCounts: Record<string, number>;
  /** total fixes placed this segment ("1 fix placed 👀") — placers secret */
  fixCount: number;
}

/** Fix result as clients see it: a landed fix is nameless (fixerId null)
 *  to everyone except the fixer until full time. Backfires are always named. */
export interface PublicFixResult extends Omit<FixResult, "fixerId"> {
  fixerId: string | null;
}

export interface PublicSegmentResult extends Omit<SegmentResult, "fixes"> {
  fixes: PublicFixResult[];
}

export interface PublicGameState
  extends Omit<GameState, "segment" | "history"> {
  segment: PublicSegment | null;
  /** redacted while live (landed fixes anonymous); full truth once finished */
  history: PublicSegmentResult[];
}

/** Everything one specific client is allowed to see. */
export interface RoomView {
  roomCode: string;
  fixture: {
    id: string;
    home: string;
    away: string;
    kickoff: number; // epoch ms
    competition: string;
  };
  /** playerId of the receiving client */
  you: string;
  state: PublicGameState;
  /** your own (unsealed) bets for the current segment */
  yourBets: { market: MarketKind; side: BetSide; stake: number }[];
  /** your own fix target this segment, if any */
  yourFixTarget: string | null;
}

export type ClientMsg =
  | {
      type: "hello";
      roomCode: string;
      /** client-generated, persisted in localStorage — this is identity */
      playerId: string;
      name: string;
      emoji: string;
    }
  | { type: "start" }
  | { type: "bet"; market: MarketKind; side: BetSide; stake: number }
  | { type: "fix"; targetId: string }
  | { type: "react"; emoji: string };

export type ServerMsg =
  | { type: "view"; view: RoomView }
  | {
      /** segment resolved: play the reveal — bets unsealed, backfires named,
       *  landed fixes anonymous (each client gets its own redacted cut) */
      type: "reveal";
      result: PublicSegmentResult;
      bets: Bet[];
    }
  | { type: "react"; playerId: string; emoji: string }
  | { type: "error"; code: string; message: string };

/**
 * REST endpoints (room server, default http://localhost:8080):
 *   GET  /api/fixtures            -> RoomView["fixture"][]
 *   POST /api/rooms {fixtureId, mode?: "live" | "replay"} -> { roomCode }
 *   WS   /ws                      -> ClientMsg / ServerMsg above
 */
export const SERVER_PORT = 8080;
