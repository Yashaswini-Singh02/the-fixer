import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StreamEvent } from "@thefix/shared";
import { Normalizer } from "../src/ingest/normalize.js";
import { merge, parseRecording, replay } from "../src/replay.js";

// Real quarterfinal recording (Spain 2-1, 2026-07-10). Not committed to git —
// tests skip when absent; re-download via /api/scores/historical/18218149.
const scoresPath = fileURLToPath(
  new URL("../../../recordings/qf-18218149-scores.sse", import.meta.url),
);
const oddsPath = fileURLToPath(
  new URL("../../../recordings/qf-18218149-odds.json", import.meta.url),
);
const haveData = existsSync(scoresPath) && existsSync(oddsPath);

describe.skipIf(!haveData)("normalizer vs real quarterfinal", () => {
  it("reconstructs match facts from cumulative scores", () => {
    const n = new Normalizer("18218149");
    const events = parseRecording(scoresPath).flatMap((r) => n.scores(r));

    for (const e of events.slice(0, 50)) StreamEvent.parse(e);

    const phases = events.filter((e) => e.kind === "phase").map((e) => e.phase);
    expect(phases).toEqual(["H1", "HT", "H2", "FT"]);

    // 9 raw goal actions in the feed, 3 real goals — cumulative wins
    const goals = events.filter((e) => e.kind === "goal");
    expect(goals.map((g) => g.team)).toEqual(["home", "away", "home"]);

    expect(events.filter((e) => e.kind === "corner")).toHaveLength(6);
    expect(events.filter((e) => e.kind === "card")).toHaveLength(4);

    const facts = events.filter((e) => "counts" in e);
    const final = facts.at(-1)!.counts;
    expect(final.goals).toEqual({ home: 2, away: 1 });
    expect(final.corners).toEqual({ home: 5, away: 1 });
    expect(final.yellows).toEqual({ home: 2, away: 2 });
    expect(final.reds).toEqual({ home: 0, away: 0 });
  });

  it("derives probabilities from demargined odds", () => {
    const n = new Normalizer("18218149");
    const raws = parseRecording(oddsPath);
    const events = raws
      .map((r) => n.odds(r))
      .filter((e): e is StreamEvent & { kind: "odds" } => e !== null);
    expect(events).toHaveLength(raws.length);

    const oneXtwo = events.find(
      (e) =>
        e.market === "1X2_PARTICIPANT_RESULT" &&
        e.period === null &&
        Object.values(e.probs).every((p) => p != null && p > 0),
    );
    expect(oneXtwo).toBeTruthy();
    const sum = Object.values(oneXtwo!.probs).reduce<number>(
      (a, b) => a + (b ?? 0),
      0,
    );
    expect(sum).toBeGreaterThan(0.97);
    expect(sum).toBeLessThan(1.03);
  });

  it("replay generator yields the same stream as direct normalization", async () => {
    const events: StreamEvent[] = [];
    const items = merge(parseRecording(scoresPath), []);
    for await (const e of replay(items, new Normalizer("18218149"))) {
      events.push(e);
    }
    expect(events.filter((e) => e.kind === "goal")).toHaveLength(3);
    expect(events.at(-1)!.phase).toBe("FT");
  });
});
