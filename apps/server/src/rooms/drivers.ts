import { Normalizer } from "../ingest/normalize.js";
import { merge, parseSseText, replay, type TimedRaw } from "../replay.js";
import { sseStream } from "../sse.js";
import { authedFetch } from "../txline/auth.js";
import type { Room } from "./room.js";

/**
 * Drivers feed normalized match events into a room. The room can't tell
 * which one is attached — historical and live produce the same stream (the
 * PRD's one-code-path rule).
 */

/**
 * Fetch a past match's full scores history from TxLINE. Available for
 * fixtures that kicked off between 6 hours and two weeks ago; throws with
 * the upstream status so room creation can fail fast instead of opening a
 * dead lobby. (No historical odds endpoint exists — the engine prices at
 * neutral base rates when no odds arrive.)
 */
export async function fetchHistoricalScores(
  apiOrigin: string,
  fixtureId: string,
): Promise<TimedRaw[]> {
  const res = await authedFetch(
    apiOrigin,
    `/api/scores/historical/${fixtureId}`,
  );
  if (!res.ok) throw new Error(`historical scores: HTTP ${res.status}`);
  return merge(parseSseText(await res.text()), []);
}

/** Replay pre-fetched raw items into the room at `speed`x realtime. */
export async function replayInto(
  room: Room,
  items: TimedRaw[],
  speed: number,
): Promise<void> {
  const normalizer = new Normalizer(room.fixture.id);
  for await (const e of replay(items, normalizer, speed)) {
    room.apply(e);
    if (room.state.status === "finished") return; // someone topped the ladder
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const IDLE_TIMEOUT_MS = 5 * 60_000;

/**
 * Follow the live TxLINE streams into the room. Same battle-tested shape as
 * the recorder: resume via Last-Event-ID, reconnect with backoff, and an
 * idle watchdog because a dead proxy connection is indistinguishable from a
 * quiet match. Headers come from a provider so every reconnect can carry a
 * fresh guest JWT instead of silently retrying with an expired one.
 */
export function driveLive(
  room: Room,
  apiOrigin: string,
  headers: (refresh: boolean) => Promise<Record<string, string>>,
): void {
  const normalizer = new Normalizer(room.fixture.id);

  // function call, not property access — apply() mutates room.state and
  // TypeScript's narrowing must not cache the status across it
  const finished = () => room.state.status === "finished";

  const follow = async (stream: "scores" | "odds") => {
    let lastEventId: string | undefined;
    let backoffMs = 1000;
    let unauthorized = false;
    while (!finished()) {
      const ac = new AbortController();
      let idleTimer = setTimeout(() => ac.abort(), IDLE_TIMEOUT_MS);
      try {
        for await (const evt of sseStream(`${apiOrigin}/api/${stream}/stream`, {
          headers: await headers(unauthorized),
          lastEventId,
          signal: ac.signal,
        })) {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => ac.abort(), IDLE_TIMEOUT_MS);
          backoffMs = 1000;
          if (evt.id) lastEventId = evt.id;
          unauthorized = false;

          let raw: unknown;
          try {
            raw = JSON.parse(evt.data);
          } catch {
            continue;
          }
          const events =
            stream === "scores"
              ? normalizer.scores(raw)
              : [normalizer.odds(raw)];
          for (const e of events) if (e) room.apply(e);
          if (finished()) {
            ac.abort();
            return;
          }
        }
      } catch (err) {
        if (!ac.signal.aborted) {
          unauthorized = /\b401\b/.test((err as Error).message);
          console.warn(
            `room ${room.code} ${stream} stream: ${(err as Error).message}; reconnecting in ${backoffMs}ms`,
          );
        }
      } finally {
        clearTimeout(idleTimer);
      }
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30_000);
    }
  };

  void follow("scores");
  void follow("odds");
}
