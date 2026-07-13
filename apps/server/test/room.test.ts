import { describe, expect, it } from "vitest";
import type { StreamEvent } from "@thefix/shared";
import type { ServerMsg } from "@thefix/engine";
import { Room, type Conn } from "../src/rooms/room.js";

/** Fake socket that records every ServerMsg it was sent. */
class FakeConn implements Conn {
  sent: ServerMsg[] = [];
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  /** most recent view message */
  get view() {
    const v = [...this.sent].reverse().find((m) => m.type === "view");
    if (!v || v.type !== "view") throw new Error("no view received");
    return v.view;
  }
}

const fixture = {
  id: "fx",
  home: "Norway",
  away: "England",
  kickoff: 0,
  competition: "test",
};

let seq = 0;
const counts = () => ({
  goals: { home: 0, away: 0 },
  corners: { home: 0, away: 0 },
  yellows: { home: 0, away: 0 },
  reds: { home: 0, away: 0 },
});
const phaseEv = (phase: StreamEvent["phase"], clockSec: number): StreamEvent =>
  ({ fixtureId: "fx", seq: seq++, ts: seq, clockSec, phase, kind: "phase" });
const clockEv = (clockSec: number): StreamEvent =>
  ({ fixtureId: "fx", seq: seq++, ts: seq, clockSec, phase: "H1", kind: "clock" });

function liveRoom() {
  const room = new Room("ABCD", fixture);
  const a = new FakeConn();
  const b = new FakeConn();
  room.hello(a, "a", "Priya", "🦊");
  room.hello(b, "b", "Rahul", "🐢");
  room.apply({ kind: "start", ts: 0, playerId: "a" });
  room.apply(phaseEv("H1", 0)); // S1 opens
  return { room, a, b };
}

describe("room redaction", () => {
  it("your bets are yours; everyone else sees only counts", () => {
    const { room, a, b } = liveRoom();
    room.apply({ kind: "bet", ts: 1, playerId: "a", market: "GOAL", side: "YES", stake: 5 });

    expect(a.view.yourBets).toEqual([{ market: "GOAL", side: "YES", stake: 5 }]);
    expect(b.view.yourBets).toEqual([]);
    expect(b.view.state.segment?.betCounts).toEqual({ a: 1 });
    // the sealed bet itself must not exist anywhere in b's payload
    expect(JSON.stringify(b.view)).not.toContain('"side"');
  });

  it("fix target visible only to the fixer; others see a bare count", () => {
    const { room, a, b } = liveRoom();
    room.apply({ kind: "fix", ts: 1, playerId: "b", targetId: "a" });

    expect(b.view.yourFixTarget).toBe("a");
    expect(a.view.yourFixTarget).toBeNull();
    expect(a.view.state.segment?.fixCount).toBe(1);
    expect(JSON.stringify(a.view)).not.toContain("fixerId");
  });

  it("segment close broadcasts reveal (with unsealed bets) before the new view", () => {
    const { room, a, b } = liveRoom();
    room.apply({ kind: "bet", ts: 1, playerId: "a", market: "GOAL", side: "YES", stake: 5 });
    room.apply({ kind: "fix", ts: 2, playerId: "b", targetId: "a" });
    room.apply(clockEv(900)); // S1 resolves, S2 opens

    const revealOf = (conn: FakeConn) => {
      const m = conn.sent.find((x) => x.type === "reveal");
      if (!m || m.type !== "reveal") throw new Error("no reveal received");
      return m;
    };

    for (const conn of [a, b]) {
      const revealAt = conn.sent.findIndex((m) => m.type === "reveal");
      expect(revealAt).toBeGreaterThan(-1);
      const reveal = revealOf(conn);
      expect(reveal.result.index).toBe(1);
      expect(reveal.bets).toEqual([
        { playerId: "a", market: "GOAL", side: "YES", stake: 5 },
      ]);
      // the post-resolve view (S2 open) must arrive after the reveal
      const viewAfter = conn.sent
        .slice(revealAt + 1)
        .find((m) => m.type === "view");
      expect(viewAfter && viewAfter.type === "view" ? viewAfter.view.state.segment?.index : null).toBe(2);
    }

    // no goal came, so a's bet lost and b's fix LANDED: b sees their own
    // handiwork, but to a (and anyone else) the fix is nameless until FT
    expect(revealOf(b).result.fixes[0]).toMatchObject({
      fixerId: "b",
      targetId: "a",
      succeeded: true,
    });
    expect(revealOf(a).result.fixes[0]).toMatchObject({
      fixerId: null,
      targetId: "a",
      succeeded: true,
    });
    // ...and the stolen rungs vanish from a's copy of the climb sheet
    expect(revealOf(b).result.climbs["b"]).toBeGreaterThan(0);
    expect(revealOf(a).result.climbs["b"]).toBeUndefined();
    // the redaction must also hold for history riding inside later views
    expect(a.view.state.history[0]!.fixes[0]!.fixerId).toBeNull();
    expect(b.view.state.history[0]!.fixes[0]!.fixerId).toBe("b");
  });

  it("rejected commands change nothing and broadcast nothing", () => {
    const { room, b } = liveRoom();
    const before = b.sent.length;
    room.apply({ kind: "bet", ts: 1, playerId: "b", market: "GOAL", side: "YES", stake: 999 });
    expect(b.sent.length).toBe(before);
    expect(room.log.some((e) => e.kind === "bet")).toBe(false);
  });

  it("reactions broadcast to everyone without touching game state", () => {
    const { room, a, b } = liveRoom();
    const stateBefore = room.state;
    room.react("a", "🔥");
    expect(room.state).toBe(stateBefore);
    for (const conn of [a, b]) {
      expect(conn.sent.at(-1)).toEqual({ type: "react", playerId: "a", emoji: "🔥" });
    }
  });

  it("late joiner becomes a spectator but still gets views", () => {
    const { room } = liveRoom();
    const z = new FakeConn();
    room.hello(z, "z", "Zoya", "🦁");
    expect(room.state.players["z"]).toBeUndefined(); // no join after start
    expect(z.view.you).toBe("z");
    expect(z.view.state.status).toBe("live");
  });
});
