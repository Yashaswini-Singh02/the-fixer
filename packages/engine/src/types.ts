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

export type GameStatus = "lobby" | "live" | "finished";

/** Rolling summary of the odds stream — the pricing engine's live input. */
export interface OddsSummary {
  /** P(over 2.5 match goals) from the demargined consensus */
  overP: number | null;
}

export interface GameState {
  fixtureId: string;
  status: GameStatus;
  organizerId: string | null;
  players: Record<string, Player>;
  phase: MatchPhase;
  clockSec: number;
  counts: MatchCounts;
  odds: OddsSummary;
  segment: Segment | null;
  history: SegmentResult[];
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
  | { kind: "fix"; ts: number; playerId: string; targetId: string };

/** Everything the reducer consumes: match stream + player commands. */
export type EngineEvent = StreamEvent | Command;
