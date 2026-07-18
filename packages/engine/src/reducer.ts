import type { MatchCounts, MatchPhase } from "@thefix/shared";
import { CONFIG } from "./config";
import { priceSegment } from "./pricing";
import type {
  EngineEvent,
  FixResult,
  GameState,
  MarketKind,
  Player,
  Segment,
  SegmentResult,
} from "./types";

/**
 * The load-bearing decision (PRD §7): a pure, deterministic reducer —
 * state + event -> state. Live SSE, historical replay, balance simulation,
 * and unit tests all drive this one function. No wall clock, no randomness:
 * time only advances when events say so.
 */

const zeroCounts = (): MatchCounts => ({
  goals: { home: 0, away: 0 },
  corners: { home: 0, away: 0 },
  yellows: { home: 0, away: 0 },
  reds: { home: 0, away: 0 },
});

export function initGame(
  fixtureId: string,
  stakeWindowSec: number = CONFIG.stakeWindowSec,
): GameState {
  return {
    fixtureId,
    stakeWindowSec,
    status: "lobby",
    organizerId: null,
    players: {},
    phase: "PRE",
    clockSec: 0,
    counts: zeroCounts(),
    odds: { overP: null },
    segment: null,
    history: [],
    guessing: null,
    winnerId: null,
  };
}

/** How many fixers a guessing victim must name correctly: "miss at most one".
 *  1→1, 2→1, 3→2, 4→3 … Shared by the guess reducer and the server's view. */
export function guessThreshold(fixerCount: number): number {
  return Math.max(1, fixerCount - 1);
}

/** The coins (and fix-lock) a player starts NEXT segment with, given their
 *  pending carry-over. Single source of truth for openSegment and the server's
 *  next-segment preview: halve first (backfire), then add bonuses. */
export function nextSegmentAllowance(p: Player): {
  coins: number;
  fixLocked: boolean;
} {
  const base = p.pendingHalve
    ? Math.floor(CONFIG.segmentAllowance / CONFIG.backfireCoinDivisor)
    : CONFIG.segmentAllowance;
  return {
    coins: Math.max(0, base + p.pendingCoinBonus),
    fixLocked: p.pendingFixLock,
  };
}

export function reduce(prev: GameState, ev: EngineEvent): GameState {
  switch (ev.kind) {
    // ── player commands ────────────────────────────────────────────────
    case "join": {
      if (prev.status !== "lobby") return prev;
      if (Object.keys(prev.players).length >= 8) return prev;
      if (prev.players[ev.playerId]) return prev;
      const s = structuredClone(prev);
      s.players[ev.playerId] = {
        id: ev.playerId,
        name: ev.name,
        emoji: ev.emoji,
        rung: 0,
        coins: 0,
        fixLocked: false,
        pendingHalve: false,
        pendingCoinBonus: 0,
        pendingFixLock: false,
      };
      s.organizerId ??= ev.playerId;
      return s;
    }

    case "start": {
      if (prev.status !== "lobby") return prev;
      if (ev.playerId !== prev.organizerId) return prev;
      if (Object.keys(prev.players).length < 2) return prev;
      const s = structuredClone(prev);
      s.status = "live";
      return s; // first segment opens on the next clock/phase event
    }

    case "bet": {
      const seg = prev.segment;
      const player = prev.players[ev.playerId];
      if (prev.status !== "live" || !seg || seg.sealed || !player) return prev;
      if (!Number.isInteger(ev.stake) || ev.stake < 1) return prev;
      const existing = seg.bets.find(
        (b) => b.playerId === ev.playerId && b.market === ev.market,
      );
      const refund = existing?.stake ?? 0;
      if (ev.stake > player.coins + refund) return prev;

      const s = structuredClone(prev);
      s.players[ev.playerId]!.coins += refund - ev.stake;
      s.segment!.bets = s.segment!.bets.filter(
        (b) => !(b.playerId === ev.playerId && b.market === ev.market),
      );
      s.segment!.bets.push({
        playerId: ev.playerId,
        market: ev.market,
        side: ev.side,
        stake: ev.stake,
      });
      return s;
    }

    case "fix": {
      const seg = prev.segment;
      const player = prev.players[ev.playerId];
      if (prev.status !== "live" || !seg || seg.sealed || !player) return prev;
      if (player.fixLocked) return prev; // penalty: a backfire last segment
      if (ev.targetId === ev.playerId) return prev;
      if (!prev.players[ev.targetId]) return prev;
      const hadFix = seg.fixes.some((f) => f.fixerId === ev.playerId);
      const refund = hadFix ? CONFIG.fixCost : 0;
      if (CONFIG.fixCost > player.coins + refund) return prev;

      const s = structuredClone(prev);
      s.players[ev.playerId]!.coins += refund - CONFIG.fixCost;
      s.segment!.fixes = s.segment!.fixes.filter(
        (f) => f.fixerId !== ev.playerId,
      );
      s.segment!.fixes.push({ fixerId: ev.playerId, targetId: ev.targetId });
      return s;
    }

    case "guess": {
      const g = prev.guessing;
      if (!g || g.segmentIndex !== ev.segmentIndex) return prev;
      const slot = g.slots.find(
        (sl) => sl.victimId === ev.playerId && !sl.resolved,
      );
      if (!slot) return prev; // not a victim, or already guessed

      // count distinct true fixers named; a repeated name can't fake a 2nd hit
      const truth = new Set(slot.fixerIds);
      const named = new Set(ev.guessedFixerIds);
      let hits = 0;
      for (const id of named) if (truth.has(id)) hits += 1;
      const correct = hits >= guessThreshold(slot.fixerIds.length);

      const s = structuredClone(prev);
      const sl = s.guessing!.slots.find(
        (x) => x.victimId === ev.playerId && !x.resolved,
      )!;
      sl.guessedIds = [...named];
      sl.resolved = true;
      sl.correct = correct;
      if (correct) {
        const p = s.players[ev.playerId];
        if (p) p.pendingCoinBonus += CONFIG.correctGuessCoinBonus;
      }
      return s;
    }

    case "guessWindowClosed": {
      if (!prev.guessing) return prev;
      const s = structuredClone(prev);
      s.guessing = null;
      // the window was blocking the segment machine — resume it now
      if (s.status === "live") {
        advanceSegments(s);
        if (s.phase === "FT" && s.status === "live") finishGame(s);
      }
      return s;
    }

    // ── odds stream: keep the pricing summary current ─────────────────
    case "odds": {
      if (
        ev.market !== "OVERUNDER_PARTICIPANT_GOALS" ||
        ev.period !== null ||
        ev.params !== "line=2.5"
      )
        return prev;
      const overP = ev.probs["over"];
      if (overP == null || overP === prev.odds.overP) return prev;
      const s = structuredClone(prev);
      s.odds.overP = overP;
      return s;
    }

    // ── match stream: facts, clock, phases drive the segment machine ──
    case "goal":
    case "corner":
    case "card":
    case "clock":
    case "phase": {
      const s = structuredClone(prev);
      if (ev.kind !== "clock" && ev.kind !== "phase") s.counts = ev.counts;
      if (ev.clockSec != null) s.clockSec = Math.max(s.clockSec, ev.clockSec);
      if (ev.kind === "phase") s.phase = ev.phase;

      // the "snake" moment: real red card slides the top of the ladder
      if (ev.kind === "card" && ev.card === "red" && s.status === "live") {
        for (const p of Object.values(s.players)) {
          if (p.rung > CONFIG.redCardSlideAboveRung) p.rung -= 1;
        }
      }

      if (s.status === "live") {
        advanceSegments(s);
        if (s.phase === "FT" && s.status === "live") finishGame(s);
      }
      return s;
    }
  }
}

// ── segment machine ──────────────────────────────────────────────────

const pastH1 = (p: MatchPhase) => p !== "PRE" && p !== "H1";
const pastH2 = (p: MatchPhase) =>
  p === "ET1" || p === "ET2" || p === "PENS" || p === "FT";

/** Which segment should be running for the current phase/clock, if any. */
function dueSegment(s: GameState): number | null {
  switch (s.phase) {
    case "H1":
      return s.clockSec < 900 ? 1 : s.clockSec < 1800 ? 2 : 3;
    case "H2":
      return s.clockSec < 3600 ? 4 : s.clockSec < 4500 ? 5 : 6;
    case "ET1":
      return 7;
    case "ET2":
      return 8;
    default:
      return null; // PRE, HT, PENS, FT: no market segment runs
  }
}

function shouldClose(s: GameState, seg: Segment): boolean {
  switch (seg.index) {
    case 1:
      return s.clockSec >= 900 || pastH1(s.phase);
    case 2:
      return s.clockSec >= 1800 || pastH1(s.phase);
    case 3:
      return pastH1(s.phase); // closes at the halftime whistle
    case 4:
      return s.clockSec >= 3600 || pastH2(s.phase);
    case 5:
      return s.clockSec >= 4500 || pastH2(s.phase);
    case 6:
      return pastH2(s.phase); // closes at the full-time whistle (or ET start)
    case 7:
      return s.phase === "ET2" || s.phase === "PENS" || s.phase === "FT";
    default:
      return s.phase === "PENS" || s.phase === "FT";
  }
}

function totals(c: MatchCounts) {
  return {
    goals: c.goals.home + c.goals.away,
    corners: c.corners.home + c.corners.away,
    cards: c.yellows.home + c.yellows.away + c.reds.home + c.reds.away,
  };
}

/** Open/seal/close segments to match the current clock+phase. Mutates s. */
function advanceSegments(s: GameState): void {
  for (let guard = 0; guard < 10; guard++) {
    // a guess window is open: freeze the machine until guessWindowClosed.
    // no segment closes or opens (and no coins reset) until it clears.
    if (s.guessing) return;
    const seg = s.segment;

    if (seg) {
      if (!seg.sealed && s.clockSec >= seg.openClock + s.stakeWindowSec) {
        seg.sealed = true;
      }
      if (shouldClose(s, seg)) {
        resolveSegment(s, seg);
        if (s.status !== "live") return; // someone topped out mid-close
        continue; // the next segment may be due immediately
      }
      return;
    }

    const due = dueSegment(s);
    if (due == null || s.history.some((h) => h.index === due)) return;
    openSegment(s, due);
    return;
  }
}

function openSegment(s: GameState, index: number): void {
  for (const p of Object.values(s.players)) {
    // fresh ammo; unspent coins vanish. carry-over from last segment's fix
    // outcome + guess lands here: halve first (backfire), then add bonuses
    // (landed fix +4, correct guess +2), so they compose — e.g. a fixer who
    // landed a job AND guessed their own fixer gets 10 + 4 + 2 = 16.
    const next = nextSegmentAllowance(p);
    p.coins = next.coins;
    p.fixLocked = next.fixLocked;
    p.pendingHalve = false;
    p.pendingCoinBonus = 0;
    p.pendingFixLock = false;
  }
  s.segment = {
    index,
    openClock: s.clockSec,
    openTotals: totals(s.counts),
    sealed: false,
    prices: priceSegment(index, s.clockSec, s.odds),
    bets: [],
    fixes: [],
  };
}

function resolveSegment(s: GameState, seg: Segment): void {
  const now = totals(s.counts);
  const outcomes: Record<MarketKind, boolean> = {
    GOAL: now.goals - seg.openTotals.goals >= 1,
    CORNERS: now.corners - seg.openTotals.corners >= 2,
    CARD: now.cards - seg.openTotals.cards >= 1,
  };

  const climbs: Record<string, number> = {};
  const wonAny: Record<string, boolean> = {};
  for (const bet of seg.bets) {
    const won = (bet.side === "YES") === outcomes[bet.market];
    if (!won) continue;
    const price = seg.prices[bet.market];
    const payout = bet.side === "YES" ? price.yes : price.no;
    const rungs = Math.min(
      Math.max(
        Math.round((bet.stake * (payout - 1)) / CONFIG.climbDivisor),
        CONFIG.rungFloorPerWin,
      ),
      CONFIG.rungCapPerMarket,
    );
    climbs[bet.playerId] = (climbs[bet.playerId] ?? 0) + rungs;
    wonAny[bet.playerId] = true;
  }

  const fixResults: FixResult[] = [];
  for (const fix of seg.fixes) {
    const fixer = s.players[fix.fixerId];
    if (wonAny[fix.targetId]) {
      // backfire: the target no longer gets a bonus rung — the whole cost now
      // falls on the fixer, who is named on the spot and, next segment, has
      // their allowance halved (10 → 5) and can't fix at all
      if (fixer) {
        fixer.pendingHalve = true;
        fixer.pendingFixLock = true;
      }
      fixResults.push({ ...fix, succeeded: false, rungs: 0 });
    } else {
      // payout scales with how likely the target was to win something —
      // fixing the cautious favorite-backer pays more than dogpiling gamblers
      const targetBets = seg.bets.filter((b) => b.playerId === fix.targetId);
      const pNone = targetBets.reduce((acc, b) => {
        const pWin =
          b.side === "YES" ? seg.prices[b.market].p : 1 - seg.prices[b.market].p;
        return acc * (1 - pWin);
      }, 1);
      const rungs = 1 + Math.round(2 * (1 - pNone));
      climbs[fix.fixerId] = (climbs[fix.fixerId] ?? 0) + rungs;
      // a landed job also pays a coin bonus next segment (10 + 4 = 14)
      if (fixer) fixer.pendingCoinBonus += CONFIG.fixSuccessCoinBonus;
      fixResults.push({ ...fix, succeeded: true, rungs });
    }
  }

  for (const [playerId, gained] of Object.entries(climbs)) {
    const p = s.players[playerId];
    if (p) p.rung = Math.min(p.rung + gained, CONFIG.ladderTop);
  }

  const result: SegmentResult = {
    index: seg.index,
    outcomes,
    climbs,
    fixes: fixResults,
    prices: seg.prices,
  };
  s.history.push(result);
  s.segment = null;

  // open a guess window for everyone a fix LANDED on: they name their fixer(s)
  // before the next segment opens. This pauses the segment machine (see the
  // guard in advanceSegments). It's skipped on the last segment automatically,
  // because finishGame — here or in the caller once the phase hits FT — clears
  // s.guessing, and there's no next segment for the +2 to land on anyway.
  const landedByVictim = new Map<string, string[]>();
  for (const fr of fixResults) {
    if (!fr.succeeded) continue;
    const list = landedByVictim.get(fr.targetId) ?? [];
    list.push(fr.fixerId);
    landedByVictim.set(fr.targetId, list);
  }
  if (landedByVictim.size > 0) {
    s.guessing = {
      segmentIndex: seg.index,
      slots: [...landedByVictim].map(([victimId, fixerIds]) => ({
        victimId,
        segmentIndex: seg.index,
        fixerIds,
        guessedIds: null,
        resolved: false,
        correct: false,
      })),
    };
  }

  if (Object.values(s.players).some((p) => p.rung >= CONFIG.ladderTop)) {
    finishGame(s);
  }
}

/** Winner = highest rung; exact tie leaves winnerId null (sudden death TBD). */
function finishGame(s: GameState): void {
  if (s.segment) resolveSegment(s, s.segment);
  // no guessing once the match is over — the last segment never runs a window
  // (there's no next allowance to reward), and fixers unseal at full time
  s.guessing = null;
  s.status = "finished";
  const ranked = Object.values(s.players).sort((a, b) => b.rung - a.rung);
  const top = ranked[0];
  if (top && (!ranked[1] || ranked[1].rung < top.rung)) {
    s.winnerId = top.id;
  }
}
