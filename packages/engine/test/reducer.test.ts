import { describe, expect, it } from "vitest";
import type { MatchCounts, StreamEvent } from "@thefix/shared";
import { CONFIG, initGame, reduce, type GameState } from "../src/index.js";

// ── synthetic stream-event helpers ──────────────────────────────────

let seq = 0;
const counts = (
  over: Partial<Record<keyof MatchCounts, { home?: number; away?: number }>> = {},
): MatchCounts => ({
  goals: { home: 0, away: 0, ...over.goals },
  corners: { home: 0, away: 0, ...over.corners },
  yellows: { home: 0, away: 0, ...over.yellows },
  reds: { home: 0, away: 0, ...over.reds },
});

const base = (clockSec: number, phase: StreamEvent["phase"]) => ({
  fixtureId: "fx",
  seq: seq++,
  ts: seq,
  clockSec,
  phase,
});

const phaseEv = (phase: StreamEvent["phase"], clockSec: number): StreamEvent =>
  ({ ...base(clockSec, phase), kind: "phase" });
const clockEv = (clockSec: number, phase: StreamEvent["phase"] = "H1"): StreamEvent =>
  ({ ...base(clockSec, phase), kind: "clock" });
const goalEv = (
  team: "home" | "away",
  c: MatchCounts,
  clockSec: number,
): StreamEvent => ({ ...base(clockSec, "H1"), kind: "goal", team, counts: c });
const cardEv = (
  team: "home" | "away",
  card: "yellow" | "red",
  c: MatchCounts,
  clockSec: number,
): StreamEvent => ({ ...base(clockSec, "H1"), kind: "card", team, card, counts: c });

function liveGame(): GameState {
  let s = initGame("fx");
  s = reduce(s, { kind: "join", ts: 0, playerId: "a", name: "Priya", emoji: "🦊" });
  s = reduce(s, { kind: "join", ts: 0, playerId: "b", name: "Rahul", emoji: "🐢" });
  s = reduce(s, { kind: "join", ts: 0, playerId: "c", name: "Zoya", emoji: "🦁" });
  s = reduce(s, { kind: "start", ts: 0, playerId: "a" });
  return reduce(s, phaseEv("H1", 0)); // S1 opens
}

// ── tests ───────────────────────────────────────────────────────────

describe("lobby", () => {
  it("first joiner becomes organizer; only organizer can start", () => {
    let s = initGame("fx");
    s = reduce(s, { kind: "join", ts: 0, playerId: "a", name: "A", emoji: "🦊" });
    s = reduce(s, { kind: "join", ts: 0, playerId: "b", name: "B", emoji: "🐢" });
    expect(s.organizerId).toBe("a");
    expect(reduce(s, { kind: "start", ts: 0, playerId: "b" }).status).toBe("lobby");
    expect(reduce(s, { kind: "start", ts: 0, playerId: "a" }).status).toBe("live");
  });

  it("needs 2+ players; no joins after start", () => {
    let s = initGame("fx");
    s = reduce(s, { kind: "join", ts: 0, playerId: "a", name: "A", emoji: "🦊" });
    expect(reduce(s, { kind: "start", ts: 0, playerId: "a" }).status).toBe("lobby");
    s = reduce(s, { kind: "join", ts: 0, playerId: "b", name: "B", emoji: "🐢" });
    s = reduce(s, { kind: "start", ts: 0, playerId: "a" });
    s = reduce(s, { kind: "join", ts: 0, playerId: "z", name: "Z", emoji: "🦉" });
    expect(s.players["z"]).toBeUndefined();
  });
});

describe("segments & betting", () => {
  it("opens S1 on first H1 event: allowance dealt, 3 markets priced", () => {
    const s = liveGame();
    expect(s.segment?.index).toBe(1);
    expect(s.players["a"]!.coins).toBe(CONFIG.segmentAllowance);
    for (const m of ["GOAL", "CORNERS", "CARD"] as const) {
      const p = s.segment!.prices[m];
      expect(p.p).toBeGreaterThan(0);
      expect(p.p).toBeLessThan(1);
      expect(p.yes).toBeGreaterThanOrEqual(1);
      expect(p.yes).toBeLessThanOrEqual(CONFIG.payoutCap);
      expect(p.no).toBeLessThanOrEqual(CONFIG.payoutCap);
    }
  });

  it("bets deduct coins, replacing refunds, overdraft rejected", () => {
    let s = liveGame();
    s = reduce(s, { kind: "bet", ts: 1, playerId: "a", market: "GOAL", side: "YES", stake: 6 });
    expect(s.players["a"]!.coins).toBe(4);
    // replace same market: refund 6, stake 3
    s = reduce(s, { kind: "bet", ts: 2, playerId: "a", market: "GOAL", side: "NO", stake: 3 });
    expect(s.players["a"]!.coins).toBe(7);
    expect(s.segment!.bets).toHaveLength(1);
    // overdraft: 8 > 7 remaining on another market
    const before = s;
    s = reduce(s, { kind: "bet", ts: 3, playerId: "a", market: "CARD", side: "YES", stake: 8 });
    expect(s).toBe(before);
  });

  it("stake window seals after 180s of match clock; late bets bounce", () => {
    let s = liveGame();
    s = reduce(s, clockEv(200));
    expect(s.segment!.sealed).toBe(true);
    const before = s;
    s = reduce(s, { kind: "bet", ts: 9, playerId: "a", market: "GOAL", side: "YES", stake: 2 });
    expect(s).toBe(before);
  });

  it("resolves S1 at 15': YES GOAL wins after a goal, rungs per formula", () => {
    let s = liveGame();
    s = reduce(s, { kind: "bet", ts: 1, playerId: "a", market: "GOAL", side: "YES", stake: 5 });
    s = reduce(s, { kind: "bet", ts: 1, playerId: "b", market: "GOAL", side: "NO", stake: 5 });
    const yesPay = s.segment!.prices.GOAL.yes;
    s = reduce(s, goalEv("home", counts({ goals: { home: 1 } }), 500));
    s = reduce(s, clockEv(900)); // boundary
    expect(s.history).toHaveLength(1);
    expect(s.history[0]!.outcomes.GOAL).toBe(true);
    const expected = Math.min(
      Math.round((5 * (yesPay - 1)) / CONFIG.climbDivisor),
      CONFIG.rungCapPerMarket,
    );
    expect(s.players["a"]!.rung).toBe(expected);
    expect(s.players["b"]!.rung).toBe(0);
    // S2 opened immediately with fresh coins
    expect(s.segment?.index).toBe(2);
    expect(s.players["a"]!.coins).toBe(CONFIG.segmentAllowance);
  });

  it("NO bet wins a quiet segment", () => {
    let s = liveGame();
    s = reduce(s, { kind: "bet", ts: 1, playerId: "b", market: "GOAL", side: "NO", stake: 6 });
    const noPay = s.segment!.prices.GOAL.no;
    s = reduce(s, clockEv(900));
    const expected = Math.min(
      Math.round((6 * (noPay - 1)) / CONFIG.climbDivisor),
      CONFIG.rungCapPerMarket,
    );
    expect(s.players["b"]!.rung).toBe(expected);
  });

  it("a winning bet always climbs at least the floor, even at tiny stakes", () => {
    let s = liveGame();
    // 1 coin on NO GOAL at short odds rounds to 0 by the raw formula —
    // the floor guarantees a win is never a dead win
    s = reduce(s, { kind: "bet", ts: 1, playerId: "b", market: "GOAL", side: "NO", stake: 1 });
    const noPay = s.segment!.prices.GOAL.no;
    expect(Math.round((1 * (noPay - 1)) / CONFIG.climbDivisor)).toBe(0);
    s = reduce(s, clockEv(900)); // quiet segment: NO wins
    expect(s.players["b"]!.rung).toBe(CONFIG.rungFloorPerWin);
  });
});

describe("the Fixer", () => {
  it("success: fixer climbs 1 + round(2P) when target wins nothing", () => {
    let s = liveGame();
    s = reduce(s, { kind: "bet", ts: 1, playerId: "a", market: "GOAL", side: "YES", stake: 5 });
    s = reduce(s, { kind: "fix", ts: 2, playerId: "c", targetId: "a" });
    expect(s.players["c"]!.coins).toBe(CONFIG.segmentAllowance - CONFIG.fixCost);
    const pGoal = s.segment!.prices.GOAL.p;
    s = reduce(s, clockEv(900)); // no goal: a's YES loses
    const expected = 1 + Math.round(2 * pGoal);
    expect(s.players["c"]!.rung).toBe(expected);
    expect(s.history[0]!.fixes[0]).toMatchObject({
      fixerId: "c",
      targetId: "a",
      succeeded: true,
    });
  });

  it("fixing a player with no bets pays the minimum 1", () => {
    let s = liveGame();
    s = reduce(s, { kind: "fix", ts: 1, playerId: "c", targetId: "b" });
    s = reduce(s, clockEv(900));
    expect(s.players["c"]!.rung).toBe(1);
  });

  it("backfire: target keeps only their bet climb (no bonus), fixer exposed + penalised", () => {
    let s = liveGame();
    s = reduce(s, { kind: "bet", ts: 1, playerId: "a", market: "GOAL", side: "YES", stake: 5 });
    s = reduce(s, { kind: "fix", ts: 2, playerId: "c", targetId: "a" });
    const yesPay = s.segment!.prices.GOAL.yes;
    s = reduce(s, goalEv("away", counts({ goals: { away: 1 } }), 400));
    s = reduce(s, clockEv(900));
    const betRungs = Math.min(
      Math.round((5 * (yesPay - 1)) / CONFIG.climbDivisor),
      CONFIG.rungCapPerMarket,
    );
    // the target no longer pockets a +1 bonus — just their own winning climb
    expect(s.players["a"]!.rung).toBe(betRungs);
    expect(s.players["c"]!.rung).toBe(0);
    const f = s.history[0]!.fixes[0]!;
    expect(f.succeeded).toBe(false);
    expect(f.rungs).toBe(0);
    // a backfire opens no guess window, so S2 opens right away; the fixer is
    // punished: half coins and locked out of fixing
    expect(s.segment?.index).toBe(2);
    expect(s.players["c"]!.coins).toBe(
      Math.floor(CONFIG.segmentAllowance / CONFIG.backfireCoinDivisor),
    );
    expect(s.players["c"]!.fixLocked).toBe(true);
    const before = s;
    expect(reduce(s, { kind: "fix", ts: 3, playerId: "c", targetId: "a" })).toBe(before);
  });

  it("cannot fix yourself; one fix per segment (retarget allowed)", () => {
    let s = liveGame();
    const before = s;
    expect(reduce(s, { kind: "fix", ts: 1, playerId: "c", targetId: "c" })).toBe(before);
    s = reduce(s, { kind: "fix", ts: 1, playerId: "c", targetId: "a" });
    s = reduce(s, { kind: "fix", ts: 2, playerId: "c", targetId: "b" });
    expect(s.segment!.fixes).toEqual([{ fixerId: "c", targetId: "b" }]);
    expect(s.players["c"]!.coins).toBe(CONFIG.segmentAllowance - CONFIG.fixCost);
  });
});

describe("coin economy & the guess window", () => {
  it("a landed job opens a guess window and pays the fixer +4 next segment (→14)", () => {
    let s = liveGame();
    s = reduce(s, { kind: "bet", ts: 1, playerId: "a", market: "GOAL", side: "YES", stake: 5 });
    s = reduce(s, { kind: "fix", ts: 2, playerId: "c", targetId: "a" });
    s = reduce(s, clockEv(900)); // no goal → a loses → c's fix lands

    // the machine is frozen on the guess window: S2 has NOT opened yet
    expect(s.guessing).not.toBeNull();
    expect(s.guessing!.segmentIndex).toBe(1);
    expect(s.guessing!.slots).toHaveLength(1);
    expect(s.guessing!.slots[0]!.victimId).toBe("a");
    expect(s.segment).toBeNull();

    s = reduce(s, { kind: "guessWindowClosed", ts: 3 });
    expect(s.guessing).toBeNull();
    expect(s.segment?.index).toBe(2);
    expect(s.players["c"]!.coins).toBe(
      CONFIG.segmentAllowance + CONFIG.fixSuccessCoinBonus, // 14
    );
    // the (non-guessing) victim just gets the plain allowance
    expect(s.players["a"]!.coins).toBe(CONFIG.segmentAllowance);
  });

  it("a correct guess pays the victim +2 next segment (→12); a wrong one pays nothing", () => {
    const setup = () => {
      let s = liveGame();
      s = reduce(s, { kind: "fix", ts: 1, playerId: "c", targetId: "a" });
      return reduce(s, clockEv(900)); // a has no bet → fix lands
    };

    // right
    let s = setup();
    s = reduce(s, {
      kind: "guess", ts: 2, playerId: "a", segmentIndex: 1, guessedFixerIds: ["c"],
    });
    expect(s.guessing!.slots[0]!.resolved).toBe(true);
    expect(s.guessing!.slots[0]!.correct).toBe(true);
    s = reduce(s, { kind: "guessWindowClosed", ts: 3 });
    expect(s.players["a"]!.coins).toBe(
      CONFIG.segmentAllowance + CONFIG.correctGuessCoinBonus, // 12
    );

    // wrong
    let w = setup();
    w = reduce(w, {
      kind: "guess", ts: 2, playerId: "a", segmentIndex: 1, guessedFixerIds: ["b"],
    });
    expect(w.guessing!.slots[0]!.correct).toBe(false);
    w = reduce(w, { kind: "guessWindowClosed", ts: 3 });
    expect(w.players["a"]!.coins).toBe(CONFIG.segmentAllowance);
  });

  it("two fixers on one victim: naming one clears the bar, reward capped at +2", () => {
    let s = liveGame();
    s = reduce(s, { kind: "fix", ts: 1, playerId: "a", targetId: "c" });
    s = reduce(s, { kind: "fix", ts: 2, playerId: "b", targetId: "c" });
    s = reduce(s, clockEv(900)); // c wins nothing → both land
    const slot = s.guessing!.slots.find((sl) => sl.victimId === "c")!;
    expect([...slot.fixerIds].sort()).toEqual(["a", "b"]);
    // threshold for 2 fixers is 1 — one correct name is enough
    s = reduce(s, {
      kind: "guess", ts: 3, playerId: "c", segmentIndex: 1, guessedFixerIds: ["a"],
    });
    expect(s.guessing!.slots.find((sl) => sl.victimId === "c")!.correct).toBe(true);
    s = reduce(s, { kind: "guessWindowClosed", ts: 4 });
    expect(s.players["c"]!.coins).toBe(
      CONFIG.segmentAllowance + CONFIG.correctGuessCoinBonus, // flat +2, not +4
    );
  });

  it("stacks a landed job (+4) with a correct guess (+2) → 16", () => {
    let s = liveGame();
    s = reduce(s, { kind: "bet", ts: 1, playerId: "a", market: "GOAL", side: "YES", stake: 5 });
    s = reduce(s, { kind: "fix", ts: 2, playerId: "c", targetId: "a" }); // c → a lands
    s = reduce(s, { kind: "fix", ts: 3, playerId: "b", targetId: "c" }); // b → c lands
    s = reduce(s, clockEv(900)); // no goal: a loses, c has no bet → both land
    // c both landed a job (+4) AND is b's victim; c names b correctly (+2)
    s = reduce(s, {
      kind: "guess", ts: 4, playerId: "c", segmentIndex: 1, guessedFixerIds: ["b"],
    });
    s = reduce(s, { kind: "guessWindowClosed", ts: 5 });
    expect(s.players["c"]!.coins).toBe(16);
  });

  it("stacks a backfire (halve) with a correct guess (+2) → 7, still fix-locked", () => {
    let s = liveGame();
    s = reduce(s, { kind: "bet", ts: 1, playerId: "a", market: "GOAL", side: "YES", stake: 5 });
    s = reduce(s, { kind: "fix", ts: 2, playerId: "c", targetId: "a" }); // will backfire
    s = reduce(s, { kind: "fix", ts: 3, playerId: "b", targetId: "c" }); // lands on c
    s = reduce(s, goalEv("home", counts({ goals: { home: 1 } }), 400)); // a wins
    s = reduce(s, clockEv(900));
    s = reduce(s, {
      kind: "guess", ts: 4, playerId: "c", segmentIndex: 1, guessedFixerIds: ["b"],
    });
    s = reduce(s, { kind: "guessWindowClosed", ts: 5 });
    expect(s.players["c"]!.coins).toBe(7); // floor(10/2) + 2
    expect(s.players["c"]!.fixLocked).toBe(true);
  });

  it("no guess window on the final segment — the game just finishes", () => {
    let s = liveGame();
    s = reduce(s, phaseEv("HT", 2700)); // closes S1..S3
    s = reduce(s, phaseEv("H2", 2700)); // S4 opens
    s = reduce(s, { kind: "fix", ts: 1, playerId: "c", targetId: "a" }); // lands (a has no bet)
    s = reduce(s, phaseEv("FT", 5700));
    expect(s.status).toBe("finished");
    expect(s.guessing).toBeNull();
  });
});

describe("live flourishes & endgame", () => {
  it("red card slides everyone above rung 10 down one", () => {
    const s = liveGame();
    s.players["a"]!.rung = 12;
    s.players["b"]!.rung = 10;
    const after = reduce(
      s,
      cardEv("home", "red", counts({ reds: { home: 1 } }), 300),
    );
    expect(after.players["a"]!.rung).toBe(11);
    expect(after.players["b"]!.rung).toBe(10);
  });

  it("FT resolves the open segment and crowns the highest rung", () => {
    let s = liveGame();
    s = reduce(s, phaseEv("HT", 2700)); // S1..S3 territory skipped: closes S1
    s = reduce(s, phaseEv("H2", 2700)); // S4 opens
    expect(s.segment?.index).toBe(4);
    s = reduce(s, { kind: "bet", ts: 1, playerId: "b", market: "GOAL", side: "NO", stake: 10 });
    s = reduce(s, phaseEv("FT", 5700));
    expect(s.status).toBe("finished");
    expect(s.segment).toBeNull();
    expect(s.winnerId).toBe("b");
  });

  it("exact tie leaves winnerId null (sudden death TBD)", () => {
    let s = liveGame();
    s = reduce(s, phaseEv("FT", 5700));
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBeNull();
  });
});
