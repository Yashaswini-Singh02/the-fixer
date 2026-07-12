import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StreamEvent, type MatchCounts } from "@thefix/shared";
import { Normalizer } from "../src/ingest/normalize.js";
import { merge, parseRecording, replay } from "../src/replay.js";

// Real recordings (not committed to git — tests skip when absent; re-download
// via /api/scores/historical/<fixtureId> and /api/odds/updates/<fixtureId>):
//   qf-18218149  Spain 2-1 (2026-07-10, decided in 90')
//   qf-18213979  Norway 1-2 England (2026-07-11, ET + two VAR-disallowed goals)
//   qf-18222446  Argentina 3-1 Switzerland (2026-07-12, ET + red card)
const rec = (name: string) =>
  fileURLToPath(new URL(`../../../recordings/${name}`, import.meta.url));
const scoresPath = rec("qf-18218149-scores.sse");
const oddsPath = rec("qf-18218149-odds.json");
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

// Both July 11 quarterfinals went to extra time — the recordings that gave
// us the ET StatusIds (6/7 -> ET1, 8/9 -> ET2, 10 -> FT).
const etQf1 = rec("qf-18213979-scores.sse");
const etQf2 = rec("qf-18222446-scores.sse");
const haveEtQfs = existsSync(etQf1) && existsSync(etQf2);

describe.skipIf(!haveEtQfs)("normalizer vs the extra-time quarterfinals", () => {
  const normalize = (fixtureId: string, path: string) => {
    const n = new Normalizer(fixtureId);
    return parseRecording(path).flatMap((r) => n.scores(r));
  };
  const finalCounts = (events: StreamEvent[]) =>
    (events.filter((e) => "counts" in e).at(-1) as { counts: MatchCounts })
      .counts;

  it("Norway-England: ET phases in order, VAR-disallowed goals absorbed", () => {
    const events = normalize("18213979", etQf1);

    const phases = events.filter((e) => e.kind === "phase").map((e) => e.phase);
    expect(phases).toEqual(["H1", "HT", "H2", "ET1", "ET2", "FT"]);

    // feed emitted 5 goal increments, 2 later pulled back by VAR —
    // cumulative reconciliation nets out to the true 1-2
    expect(finalCounts(events).goals).toEqual({ home: 1, away: 2 });

    // the ET1 winner carries the ET1 phase (drives segment 7)
    const goals = events.filter((e) => e.kind === "goal");
    expect(goals.at(-1)).toMatchObject({ team: "away", phase: "ET1" });
  });

  it("Argentina-Switzerland: red card fact, goals in ET2", () => {
    const events = normalize("18222446", etQf2);

    const phases = events.filter((e) => e.kind === "phase").map((e) => e.phase);
    expect(phases).toEqual(["H1", "HT", "H2", "ET1", "ET2", "FT"]);

    const final = finalCounts(events);
    expect(final.goals).toEqual({ home: 3, away: 1 });
    expect(final.reds).toEqual({ home: 0, away: 1 });

    const reds = events.filter((e) => e.kind === "card" && e.card === "red");
    expect(reds).toHaveLength(1);
    expect(reds[0]).toMatchObject({ team: "away", phase: "H2" });

    const etGoals = events.filter(
      (e) => e.kind === "goal" && e.phase === "ET2",
    );
    expect(etGoals).toHaveLength(2);
  });
});
