import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONFIG, initGame, reduce, type GameState } from "@thefix/engine";
import { Normalizer } from "../src/ingest/normalize.js";
import { merge, parseRecording } from "../src/replay.js";

/**
 * Integration sim: the full pipeline against real recorded matches.
 * Raw recording -> Normalizer -> reducer, with three bot players betting
 * every segment. Everything is deterministic, so these games play out
 * identically on every run — any drift is a regression in the pipeline.
 *
 * Bots:
 *   yes  rides GOAL YES with 5 coins every segment
 *   no   backs the quiet segment: GOAL NO 5 + CARD YES 3
 *   fix  CORNERS NO 4, and fixes `yes` every single segment
 */

const rec = (name: string) =>
  fileURLToPath(new URL(`../../../recordings/${name}`, import.meta.url));

function placeBets(s: GameState, ts: number): GameState {
  s = reduce(s, { kind: "bet", ts, playerId: "yes", market: "GOAL", side: "YES", stake: 5 });
  s = reduce(s, { kind: "bet", ts, playerId: "no", market: "GOAL", side: "NO", stake: 5 });
  s = reduce(s, { kind: "bet", ts, playerId: "no", market: "CARD", side: "YES", stake: 3 });
  s = reduce(s, { kind: "bet", ts, playerId: "fix", market: "CORNERS", side: "NO", stake: 4 });
  s = reduce(s, { kind: "fix", ts, playerId: "fix", targetId: "yes" });
  return s;
}

/** Engine invariants that must hold after every event of a real match. */
function checkInvariants(s: GameState, prev: GameState, at: string): string[] {
  const bad: string[] = [];
  for (const p of Object.values(s.players)) {
    if (!Number.isInteger(p.coins) || p.coins < 0)
      bad.push(`${at}: ${p.id} coins=${p.coins}`);
    if (p.rung < 0 || p.rung > CONFIG.ladderTop)
      bad.push(`${at}: ${p.id} rung=${p.rung}`);
  }
  if (s.clockSec < prev.clockSec)
    bad.push(`${at}: clock went backwards ${prev.clockSec} -> ${s.clockSec}`);
  if (prev.status === "finished" && s.status !== "finished")
    bad.push(`${at}: game un-finished itself`);
  if (s.segment) {
    for (const m of ["GOAL", "CORNERS", "CARD"] as const) {
      const { p, yes, no } = s.segment.prices[m];
      if (!(p > 0 && p < 1) || yes < 1 || yes > CONFIG.payoutCap || no < 1 || no > CONFIG.payoutCap)
        bad.push(`${at}: S${s.segment.index} ${m} price p=${p} yes=${yes} no=${no}`);
    }
  }
  const indexes = s.history.map((h) => h.index);
  if (indexes.some((x, i) => i > 0 && x <= indexes[i - 1]!))
    bad.push(`${at}: history indexes not increasing: ${indexes}`);
  return bad;
}

function runSim(fixtureId: string, scoresFile: string, oddsFile: string) {
  const normalizer = new Normalizer(fixtureId);
  const items = merge(parseRecording(rec(scoresFile)), parseRecording(rec(oddsFile)));

  let s = initGame(fixtureId);
  s = reduce(s, { kind: "join", ts: 0, playerId: "yes", name: "Yes-Man", emoji: "🚀" });
  s = reduce(s, { kind: "join", ts: 0, playerId: "no", name: "Contrarian", emoji: "🧊" });
  s = reduce(s, { kind: "join", ts: 0, playerId: "fix", name: "The Fixer", emoji: "🔨" });
  s = reduce(s, { kind: "start", ts: 0, playerId: "yes" });

  const violations: string[] = [];
  let lastSegIndex: number | null = null;
  let eventCount = 0;

  for (const item of items) {
    const events =
      item.src === "scores"
        ? normalizer.scores(item.raw)
        : [normalizer.odds(item.raw)];
    for (const e of events) {
      if (!e) continue;
      const prev = s;
      s = reduce(s, e);
      eventCount++;
      if (violations.length < 5)
        violations.push(...checkInvariants(s, prev, `ev${eventCount}(${e.kind})`));

      // bots don't play the guess window — let it "time out" so the paused
      // segment machine advances (the deterministic stand-in for the server's
      // 30s timer injecting guessWindowClosed)
      while (s.guessing) s = reduce(s, { kind: "guessWindowClosed", ts: e.ts });

      if (s.segment && s.segment.index !== lastSegIndex) {
        lastSegIndex = s.segment.index;
        s = placeBets(s, e.ts);
      }
    }
  }
  return { final: s, violations, eventCount };
}

const cases = [
  { name: "QF Spain 2-1 (90 minutes)", fixtureId: "18218149",
    scores: "qf-18218149-scores.sse", odds: "qf-18218149-odds.json",
    segments: [1, 2, 3, 4, 5, 6] },
  { name: "QF Norway 1-2 England (ET, VAR)", fixtureId: "18213979",
    scores: "qf-18213979-scores.sse", odds: "qf-18213979-odds.json",
    segments: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: "QF Argentina 3-1 Switzerland (ET, red card)", fixtureId: "18222446",
    scores: "qf-18222446-scores.sse", odds: "qf-18222446-odds.json",
    segments: [1, 2, 3, 4, 5, 6, 7, 8] },
] as const;

for (const c of cases) {
  const have = existsSync(rec(c.scores)) && existsSync(rec(c.odds));
  describe.skipIf(!have)(`bot game vs ${c.name}`, () => {
    it("plays a full clean game through the real recording", () => {
      const { final, violations, eventCount } = runSim(c.fixtureId, c.scores, c.odds);

      expect(violations).toEqual([]);
      expect(final.status).toBe("finished");
      expect(final.segment).toBeNull();

      const played = final.history.map((h) => h.index);
      // every due segment ran, unless someone topped the ladder first
      const toppedOut = Object.values(final.players).some(
        (p) => p.rung >= CONFIG.ladderTop,
      );
      if (!toppedOut) expect(played).toEqual([...c.segments]);
      else expect([...c.segments].slice(0, played.length)).toEqual(played);

      // winner must be the strictly-highest rung (null on tie)
      const ranked = Object.values(final.players).sort((a, b) => b.rung - a.rung);
      const expectedWinner =
        ranked[0]!.rung > (ranked[1]?.rung ?? -1) ? ranked[0]!.id : null;
      expect(final.winnerId).toBe(expectedWinner);

      // the ladder moved: a real match must produce climbs
      expect(ranked[0]!.rung).toBeGreaterThan(0);

      const rungs = Object.fromEntries(
        Object.values(final.players).map((p) => [p.name, p.rung]),
      );
      console.log(
        `${c.name}: ${eventCount} events, segments [${played}], ` +
          `rungs ${JSON.stringify(rungs)}, winner=${final.winnerId ?? "tie"}`,
      );
    });
  });
}
