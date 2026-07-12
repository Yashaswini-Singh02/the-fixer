import { Normalizer } from "./ingest/normalize.js";
import { merge, parseRecording, replay } from "./replay.js";

/**
 * Usage:
 *   pnpm replay <scores-file> [odds-file] [speed]
 *
 * speed: realtime multiplier (e.g. 60), default = as fast as possible.
 */

const [scoresPath, oddsPath, speedArg] = process.argv.slice(2);
if (!scoresPath) {
  console.error("usage: pnpm replay <scores-file> [odds-file] [speed]");
  process.exit(1);
}

const scores = parseRecording(scoresPath);
const odds = oddsPath ? parseRecording(oddsPath) : [];
const fixtureId = String(
  scores.find((r) => r.FixtureId)?.FixtureId ??
    odds.find((r) => r.FixtureId)?.FixtureId,
);
const speed = speedArg ? Number(speedArg) : Infinity;

const mmss = (s: number | null) =>
  s == null
    ? "--:--"
    : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

console.log(
  `replaying fixture ${fixtureId}: ${scores.length} score records, ${odds.length} odds records, speed=${speed}x`,
);

let oddsCount = 0;
const t0 = Date.now();
for await (const e of replay(merge(scores, odds), new Normalizer(fixtureId), speed)) {
  switch (e.kind) {
    case "phase":
      console.log(`[${mmss(e.clockSec)}] ── ${e.phase} ──`);
      break;
    case "goal":
      console.log(
        `[${mmss(e.clockSec)}] ⚽ GOAL ${e.team}  (${e.counts.goals.home}-${e.counts.goals.away})`,
      );
      break;
    case "corner":
      console.log(
        `[${mmss(e.clockSec)}] 🚩 corner ${e.team}  (total ${e.counts.corners.home + e.counts.corners.away})`,
      );
      break;
    case "card":
      console.log(`[${mmss(e.clockSec)}] 🟨 ${e.card} card ${e.team}`);
      break;
    case "odds":
      oddsCount++;
      if (oddsCount % 10_000 === 0)
        console.log(`      … ${oddsCount} odds updates`);
      break;
  }
}
console.log(
  `done: ${oddsCount} odds updates normalized in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
