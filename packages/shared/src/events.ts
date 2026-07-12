import { z } from "zod";

/**
 * Normalized event stream — the single input format for the game engine.
 * Live TxLINE SSE (via the ingest normalizer) and historical replay both
 * produce these.
 */

export const MatchPhase = z.enum([
  "PRE",
  "H1",
  "HT",
  "H2",
  "ET1",
  "ET2",
  "PENS",
  "FT",
]);
export type MatchPhase = z.infer<typeof MatchPhase>;

export const Side = z.enum(["home", "away"]);
export type Side = z.infer<typeof Side>;

export const SideCounts = z.object({
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
});
export type SideCounts = z.infer<typeof SideCounts>;

/** Cumulative match facts — the authoritative basis for market resolution. */
export const MatchCounts = z.object({
  goals: SideCounts,
  corners: SideCounts,
  yellows: SideCounts,
  reds: SideCounts,
});
export type MatchCounts = z.infer<typeof MatchCounts>;

const base = {
  fixtureId: z.string(),
  /** monotonic sequence assigned by the normalizer */
  seq: z.number().int().nonnegative(),
  /** source timestamp, epoch ms */
  ts: z.number(),
  /** match clock in seconds, when the feed provides it */
  clockSec: z.number().nullable(),
  phase: MatchPhase,
};

export const GoalEvent = z.object({
  ...base,
  kind: z.literal("goal"),
  team: Side,
  counts: MatchCounts,
});

export const CornerEvent = z.object({
  ...base,
  kind: z.literal("corner"),
  team: Side,
  counts: MatchCounts,
});

export const CardEvent = z.object({
  ...base,
  kind: z.literal("card"),
  team: Side,
  card: z.enum(["yellow", "red"]),
  counts: MatchCounts,
});

/** Phase transition; the new phase is in `phase`. */
export const PhaseEvent = z.object({
  ...base,
  kind: z.literal("phase"),
});

export const ClockEvent = z.object({
  ...base,
  kind: z.literal("clock"),
});

/**
 * One odds update from the TxLINE StablePrice (demargined) feed.
 * `probs` maps price name -> implied probability (from Pct when present,
 * else 1000/milliprice). `raw` keeps the full record for provenance.
 */
export const OddsEvent = z.object({
  ...base,
  kind: z.literal("odds"),
  market: z.string(),
  period: z.string().nullable(),
  params: z.string().nullable(),
  inRunning: z.boolean(),
  probs: z.record(z.string(), z.number().nullable()),
  raw: z.unknown(),
});

export const StreamEvent = z.discriminatedUnion("kind", [
  GoalEvent,
  CornerEvent,
  CardEvent,
  PhaseEvent,
  ClockEvent,
  OddsEvent,
]);
export type StreamEvent = z.infer<typeof StreamEvent>;
export type GoalEvent = z.infer<typeof GoalEvent>;
export type CornerEvent = z.infer<typeof CornerEvent>;
export type CardEvent = z.infer<typeof CardEvent>;
export type PhaseEvent = z.infer<typeof PhaseEvent>;
export type ClockEvent = z.infer<typeof ClockEvent>;
export type OddsEvent = z.infer<typeof OddsEvent>;
