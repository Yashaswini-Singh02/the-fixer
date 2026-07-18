import type { MatchCounts, MatchPhase, StreamEvent } from "@thefix/shared";

export type MarketKind = "GOAL" | "CORNERS" | "CARD";
export const MARKETS: readonly MarketKind[] = ["GOAL", "CORNERS", "CARD"];
export type BetSide = "YES" | "NO";

export interface Player {
  id: string;
  name: string;
  emoji: string;
  rung: number;
  /** coins remaining in the current segment */
  coins: number;
  /** fix banned this segment (a fix backfired on you last segment) */
  fixLocked: boolean;
  // ── carry-over modifiers, applied to NEXT segment's allowance then cleared ──
  /** halve next allowance (10 → 5) — set when your fix backfires */
  pendingHalve: boolean;
  /** additive coins next segment — a landed fix (+4) and/or a correct guess
   *  (+2) both accumulate here, so they stack (e.g. 10 + 4 + 2 = 16) */
  pendingCoinBonus: number;
  /** ban fixing next segment — set alongside pendingHalve on a backfire */
  pendingFixLock: boolean;
}

export interface MarketPrice {
  /** model probability of YES */
  p: number;
  /** decimal payout for YES (1/p, capped) */
  yes: number;
  /** decimal payout for NO (1/(1-p), capped) */
  no: number;
}

export interface Bet {
  playerId: string;
  market: MarketKind;
  side: BetSide;
  stake: number;
}

export interface Fix {
  fixerId: string;
  targetId: string;
}

export interface Segment {
  /** 1-based: S1..S6, S7/S8 for extra time */
  index: number;
  /** match clock (sec) when the segment opened */
  openClock: number;
  /** cumulative match totals at open — resolution reads the delta */
  openTotals: { goals: number; corners: number; cards: number };
  /** true once the stake window has closed; bets are hidden until resolve */
  sealed: boolean;
  prices: Record<MarketKind, MarketPrice>;
  bets: Bet[];
  fixes: Fix[];
}

export interface FixResult {
  fixerId: string;
  targetId: string;
  succeeded: boolean;
  /** rungs the fixer climbed (success) or the target's bonus (backfire) */
  rungs: number;
}

export interface SegmentResult {
  index: number;
  outcomes: Record<MarketKind, boolean>;
  /** rungs gained per player this segment */
  climbs: Record<string, number>;
  fixes: FixResult[];
  prices: Record<MarketKind, MarketPrice>;
}

/** One fixed player's open guess: name your fixer(s) before the window shuts. */
export interface GuessSlot {
  /** the player who was fixed and gets to guess */
  victimId: string;
  segmentIndex: number;
  /** the true fixer id(s) who landed on this victim — SERVER-ONLY truth,
   *  never leaves the room in a client view */
  fixerIds: string[];
  /** ids the victim named, once they've submitted (null while unresolved) */
  guessedIds: string[] | null;
  /** true once submitted or the window closed */
  resolved: boolean;
  /** did they clear the "miss at most one" bar — only meaningful once resolved */
  correct: boolean;
}

/** The between-segments guess window. While non-null the segment machine is
 *  paused: no next segment opens until guessWindowClosed clears it. */
export interface GuessingState {
  segmentIndex: number;
  slots: GuessSlot[];
}

export type GameStatus = "lobby" | "live" | "finished";

/** Rolling summary of the odds stream — the pricing engine's live input. */
export interface OddsSummary {
  /** P(over 2.5 match goals) from the demargined consensus */
  overP: number | null;
}

export interface GameState {
  fixtureId: string;
  stakeWindowSec: number;
  status: GameStatus;
  organizerId: string | null;
  players: Record<string, Player>;
  phase: MatchPhase;
  clockSec: number;
  counts: MatchCounts;
  odds: OddsSummary;
  segment: Segment | null;
  history: SegmentResult[];
  /** active between-segments guess window, or null. Pauses the segment machine
   *  while a fixed player names their fixer (see GuessingState). */
  guessing: GuessingState | null;
  winnerId: string | null;
}

/** Player/room commands — the second event source besides the match stream. */
export type Command =
  | { kind: "join"; ts: number; playerId: string; name: string; emoji: string }
  | { kind: "start"; ts: number; playerId: string }
  | {
      kind: "bet";
      ts: number;
      playerId: string;
      market: MarketKind;
      side: BetSide;
      stake: number;
    }
  | { kind: "fix"; ts: number; playerId: string; targetId: string }
  | {
      kind: "guess";
      ts: number;
      playerId: string;
      /** which resolved segment's fix(es) this guess is for */
      segmentIndex: number;
      /** the fixer(s) the victim is naming; each true fixer matches at most once */
      guessedFixerIds: string[];
    }
  /** server-injected when the 30s window elapses (or everyone has guessed):
   *  clears the guess window and lets the next segment open */
  | { kind: "guessWindowClosed"; ts: number };

/** Everything the reducer consumes: match stream + player commands. */
export type EngineEvent = StreamEvent | Command;
