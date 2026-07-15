import type {
  Bet,
  BetSide,
  FixResult,
  GameState,
  MarketKind,
  Player,
  Segment,
  SegmentResult,
} from "./types.js";

/**
 * Wire protocol between room server and PWA client.
 * THE CONTRACT for parallel front/back development — both sides import
 * these types. Server is authoritative; clients render views and send
 * commands. Protocol changes go through the server agent only.
 */

/** Player as clients see it. The carry-over bookkeeping is stripped: a landed
 *  fix stays anonymous, so its +coin bonus must NOT be inferrable from another
 *  player's pending fields. `fixLocked` stays visible — a backfire is named in
 *  public anyway, so everyone already knows who's benched. */
export type PublicPlayer = Omit<
  Player,
  "pendingHalve" | "pendingCoinBonus" | "pendingFixLock"
>;

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
  extends Omit<GameState, "segment" | "history" | "players" | "guessing"> {
  players: Record<string, PublicPlayer>;
  segment: PublicSegment | null;
  /** redacted while live (landed fixes anonymous); full truth once finished */
  history: PublicSegmentResult[];
  // NOTE: `guessing` is dropped entirely — it holds the true fixer ids. What a
  // client is allowed to know about its own open guess rides on RoomView.guess.
}

/** Your open guess window, if a fix landed on you this reveal. Carries only
 *  what you may see — never the true fixer ids. */
export interface YourGuess {
  /** the resolved segment whose fix(es) you're naming */
  segmentIndex: number;
  /** how many fixes landed on you = how many names you submit */
  fixCount: number;
  /** how many you must get right to earn the bonus ("miss at most one") */
  needed: number;
  /** everyone you can accuse (all players but you) */
  candidates: { id: string; name: string; emoji: string }[];
  /** wall-clock ms the window shuts (server-set); null if unknown */
  deadline: number | null;
  /** true once you've submitted a guess this window */
  submitted: boolean;
  /** whether you cleared the bar — null until you submit */
  correct: boolean | null;
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
  /** your open guess window, or null if no fix landed on you this reveal */
  guess: YourGuess | null;
  /** preview of YOUR next-segment carry-over from this segment's fix outcome +
   *  guess (e.g. 14 / 5 / 12, and whether you're fix-locked), or null if the
   *  plain allowance applies. Derived from your own (unstripped) pending state. */
  nextSegment: { coins: number; fixLocked: boolean } | null;
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
  | {
      /** name your fixer(s) in the guess window; must clear "miss at most one" */
      type: "guess";
      segmentIndex: number;
      guessedFixerIds: string[];
    }
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
