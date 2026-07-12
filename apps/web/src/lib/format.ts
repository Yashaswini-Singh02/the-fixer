import type { GameState, MarketKind } from "@thefix/engine";

type MatchPhase = GameState["phase"];

/** decimal payout → "2.8×" (one decimal is enough on a phone) */
export const odds = (x: number): string => `${x.toFixed(1)}×`;

/** match clock seconds → "45:12", clamped display like a stadium board */
export function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** seconds remaining → "1:23" or "0:07" */
export function countdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export const MARKET_META: Record<
  MarketKind,
  { icon: string; label: string; q: string }
> = {
  GOAL: { icon: "⚽", label: "Goal", q: "A goal this segment?" },
  CORNERS: { icon: "🚩", label: "Corners", q: "2 or more corners?" },
  CARD: { icon: "🟨", label: "Card", q: "Any card shown?" },
};

export const PHASE_LABEL: Record<MatchPhase, string> = {
  PRE: "Kickoff soon",
  H1: "1st half",
  HT: "Half time",
  H2: "2nd half",
  ET1: "Extra time",
  ET2: "Extra time",
  PENS: "Penalties",
  FT: "Full time",
};

/** segment index → the human-facing segment label */
export const segmentLabel = (i: number): string => `Segment ${i}`;
export const segmentTag = (i: number): string => `S${i}`;
