import type { MatchCounts, MatchPhase, Side, StreamEvent } from "@thefix/shared";

/**
 * TxLINE scores-feed StatusId -> game phase, observed from real devnet data:
 * 1 pre-match, 2 first half, 3 halftime, 4 second half, 5 post-match (after
 * 90'), 100 finalised. Both 2026 semis went long and showed the ET sequence:
 * 6 break before ET, 7 ET first half, 8 ET halftime, 9 ET second half,
 * 10 post-ET. The pre-ET breaks map to the upcoming period so the previous
 * segment closes at the whistle and the next opens while friends can still
 * bet. Shootout StatusIds remain unobserved (no semi went to pens) — if the
 * final does, 100 still lands us on FT; extend here when the data appears.
 */
const STATUS_PHASE: Record<number, MatchPhase> = {
  1: "PRE",
  2: "H1",
  3: "HT",
  4: "H2",
  5: "FT",
  6: "ET1",
  7: "ET1",
  8: "ET2",
  9: "ET2",
  10: "FT",
  100: "FT",
};

const zero = (): MatchCounts => ({
  goals: { home: 0, away: 0 },
  corners: { home: 0, away: 0 },
  yellows: { home: 0, away: 0 },
  reds: { home: 0, away: 0 },
});


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

  scores(raw: any): StreamEvent[] {
    if (String(raw.FixtureId) !== this.fixtureId) return [];

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
