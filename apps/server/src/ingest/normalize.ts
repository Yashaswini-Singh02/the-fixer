import type { MatchCounts, MatchPhase, Side, StreamEvent } from "@thefix/shared";

/**
 * TxLINE scores-feed StatusId -> game phase, observed from real devnet data:
 * 1 pre-match, 2 first half, 3 halftime, 4 second half, 5 post-match,
 * 100 finalised. Extra-time / shootout StatusIds are unknown until we see a
 * knockout that goes long — the mapping is the single place to extend.
 */
const STATUS_PHASE: Record<number, MatchPhase> = {
  1: "PRE",
  2: "H1",
  3: "HT",
  4: "H2",
  5: "FT",
  100: "FT",
};

const zero = (): MatchCounts => ({
  goals: { home: 0, away: 0 },
  corners: { home: 0, away: 0 },
  yellows: { home: 0, away: 0 },
  reds: { home: 0, away: 0 },
});

/**
 * Stateful per-fixture normalizer: raw TxLINE records in, normalized
 * StreamEvents out.
 *
 * Fact events (goal/corner/card) are derived from the CUMULATIVE `Score`
 * object, not from raw actions: the feed carries provisional actions, VAR
 * amends and discards (a 3-goal match showed 9 raw `goal` actions), while
 * the cumulative counters are authoritative. We emit one event per counter
 * increment and absorb downward corrections silently — resolution at segment
 * boundaries always reads true counts.
 */
const PHASE_ORDER: MatchPhase[] = [
  "PRE",
  "H1",
  "HT",
  "H2",
  "ET1",
  "ET2",
  "PENS",
  "FT",
];

export class Normalizer {
  private phase: MatchPhase = "PRE";
  private counts = zero();
  private seq = 0;
  private lastRawSeq = -Infinity;
  private lastClockEmit: number | null = null;

  constructor(readonly fixtureId: string) {}

  private base(ts: number, clockSec: number | null) {
    return {
      fixtureId: this.fixtureId,
      seq: this.seq++,
      ts,
      clockSec,
      phase: this.phase,
    };
  }

  /** One raw scores-feed record -> zero or more normalized events. */
  scores(raw: any): StreamEvent[] {
    if (String(raw.FixtureId) !== this.fixtureId) return [];

    // the feed multiplexes redundant upstream connections; one can lag.
    // Seq is the feed's own ordering — drop stale/duplicate records
    // (also dedupes Last-Event-ID replays on live reconnects)
    if (typeof raw.Seq === "number") {
      if (raw.Seq <= this.lastRawSeq) return [];
      this.lastRawSeq = raw.Seq;
    }

    const out: StreamEvent[] = [];
    const ts: number = raw.Ts ?? 0;
    const clockSec: number | null = raw.Clock?.Seconds ?? null;

    const nextPhase = STATUS_PHASE[raw.StatusId as number];
    if (
      nextPhase &&
      PHASE_ORDER.indexOf(nextPhase) > PHASE_ORDER.indexOf(this.phase)
    ) {
      this.phase = nextPhase;
      out.push({ ...this.base(ts, clockSec), kind: "phase" });
    }

    if (raw.Score) {
      const p1IsHome = raw.Participant1IsHome !== false;
      const target = zero();
      for (const side of ["home", "away"] as Side[]) {
        const key =
          (side === "home") === p1IsHome ? "Participant1" : "Participant2";
        const totals = raw.Score[key]?.Total ?? {};
        target.goals[side] = totals.Goals ?? 0;
        target.corners[side] = totals.Corners ?? 0;
        target.yellows[side] = totals.YellowCards ?? 0;
        target.reds[side] = totals.RedCards ?? 0;
      }
      out.push(...this.reconcile(target, ts, clockSec));
    }

    // clock ticks pace the game engine (stake-window seal, segment close):
    // emit on adjustments and roughly every 15s of clock movement — the feed's
    // constant possession chatter gives us plenty of carriers
    if (
      clockSec != null &&
      (raw.Action === "clock_adjustment" ||
        this.lastClockEmit === null ||
        clockSec - this.lastClockEmit >= 15)
    ) {
      this.lastClockEmit = clockSec;
      out.push({ ...this.base(ts, clockSec), kind: "clock" });
    }
    return out;
  }

  /** Emit one fact event per counter increment; adopt corrections silently. */
  private reconcile(
    target: MatchCounts,
    ts: number,
    clockSec: number | null,
  ): StreamEvent[] {
    const out: StreamEvent[] = [];
    for (const side of ["home", "away"] as Side[]) {
      while (this.counts.goals[side] < target.goals[side]) {
        this.counts.goals[side]++;
        out.push({
          ...this.base(ts, clockSec),
          kind: "goal",
          team: side,
          counts: structuredClone(this.counts),
        });
      }
      while (this.counts.corners[side] < target.corners[side]) {
        this.counts.corners[side]++;
        out.push({
          ...this.base(ts, clockSec),
          kind: "corner",
          team: side,
          counts: structuredClone(this.counts),
        });
      }
      while (this.counts.yellows[side] < target.yellows[side]) {
        this.counts.yellows[side]++;
        out.push({
          ...this.base(ts, clockSec),
          kind: "card",
          team: side,
          card: "yellow",
          counts: structuredClone(this.counts),
        });
      }
      while (this.counts.reds[side] < target.reds[side]) {
        this.counts.reds[side]++;
        out.push({
          ...this.base(ts, clockSec),
          kind: "card",
          team: side,
          card: "red",
          counts: structuredClone(this.counts),
        });
      }
      for (const k of ["goals", "corners", "yellows", "reds"] as const) {
        if (this.counts[k][side] > target[k][side]) {
          this.counts[k][side] = target[k][side];
        }
      }
    }
    return out;
  }

  /** One raw odds record -> normalized odds event (null if other fixture). */
  odds(raw: any): StreamEvent | null {
    if (String(raw.FixtureId) !== this.fixtureId) return null;
    const names: string[] = raw.PriceNames ?? [];
    const probs: Record<string, number | null> = {};
    names.forEach((name, i) => {
      const pct = Number(raw.Pct?.[i]);
      const milli = Number(raw.Prices?.[i]);
      probs[name] =
        Number.isFinite(pct) && pct > 0
          ? pct / 100
          : milli > 0
            ? 1000 / milli
            : null;
    });
    return {
      ...this.base(raw.Ts ?? 0, null),
      kind: "odds",
      market: String(raw.SuperOddsType ?? "UNKNOWN"),
      period: raw.MarketPeriod ?? null,
      params: raw.MarketParameters ?? null,
      inRunning: !!raw.InRunning,
      probs,
      raw,
    };
  }
}
