import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RoomView } from "@thefix/engine";
import { authedFetch } from "../txline/auth.js";

type Fixture = RoomView["fixture"];

export type FixtureKind = "upcoming" | "live" | "past";
export type ListedFixture = Fixture & { kind: FixtureKind };

/**
 * TxLINE has no "past fixtures" listing: the snapshot is a rolling window
 * that forgets a match within a day or two of kickoff, and the historical
 * scores payload carries participant IDs but no names. So we build our own
 * index — every fixture that ever appears in the snapshot is persisted to
 * disk, and past matches are offered from that memory for as long as the
 * feed's historical endpoint retains them (kickoff 6h..14d ago).
 */
const HISTORICAL_MIN_AGE_MS = 6 * 3_600_000;
const HISTORICAL_MAX_AGE_MS = 14 * 24 * 3_600_000;
const SNAPSHOT_TTL_MS = 5 * 60_000;

export class FixtureRegistry {
  private seen = new Map<string, Fixture>();
  private lastPoll = 0;

  constructor(
    private readonly origin: string,
    private readonly file: string,
  ) {
    try {
      const rows = JSON.parse(readFileSync(file, "utf8")) as Fixture[];
      for (const f of rows) this.seen.set(f.id, f);
    } catch {
      /* first boot — the index fills as the snapshot is polled */
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify([...this.seen.values()], null, 1));
  }

  /** Poll the snapshot (throttled to 5 min) and fold new fixtures in. */
  private async refresh(): Promise<void> {
    if (Date.now() - this.lastPoll < SNAPSHOT_TTL_MS) return;
    this.lastPoll = Date.now();
    try {
      const res = await authedFetch(this.origin, "/api/fixtures/snapshot");
      if (!res.ok) {
        console.warn(`fixtures snapshot: HTTP ${res.status}`);
        return;
      }
      const raw = (await res.json()) as any[];
      let changed = false;
      for (const f of raw) {
        if (!f?.FixtureId || !f.Participant1 || !f.Participant2) continue;
        const fx: Fixture = {
          id: String(f.FixtureId),
          home: String(f.Participant1),
          away: String(f.Participant2),
          kickoff: Number(f.StartTime ?? 0),
          competition: String(f.Competition ?? ""),
        };
        const prev = this.seen.get(fx.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(fx)) {
          this.seen.set(fx.id, fx);
          changed = true;
        }
      }
      if (changed) this.persist();
    } catch {
      /* snapshot flakiness must not take the server down; index stays stale */
    }
  }

  private kindOf(f: Fixture, now: number): FixtureKind | null {
    const age = now - f.kickoff;
    if (age < 0) return "upcoming";
    if (age < HISTORICAL_MIN_AGE_MS) return "live";
    if (age <= HISTORICAL_MAX_AGE_MS) return "past";
    return null; // fell out of the feed's historical retention
  }

  /** Upcoming + live (soonest first), then the newest 3 past matches. */
  async list(): Promise<ListedFixture[]> {
    await this.refresh();
    const now = Date.now();
    const all = [...this.seen.values()]
      .map((f) => ({ ...f, kind: this.kindOf(f, now) }))
      .filter((f): f is ListedFixture => f.kind !== null);
    const current = all
      .filter((f) => f.kind !== "past")
      .sort((a, b) => a.kickoff - b.kickoff);
    const past = all
      .filter((f) => f.kind === "past")
      .sort((a, b) => b.kickoff - a.kickoff)
      .slice(0, 3);
    return [...current, ...past];
  }

  /** One fixture with its current kind, or undefined if unknown/expired. */
  async byId(id: string): Promise<ListedFixture | undefined> {
    await this.refresh();
    const f = this.seen.get(id);
    if (!f) return undefined;
    const kind = this.kindOf(f, Date.now());
    return kind ? { ...f, kind } : undefined;
  }
}
