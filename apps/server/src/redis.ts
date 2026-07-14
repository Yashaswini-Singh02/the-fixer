import Redis from "ioredis";
import type { EngineEvent, RoomView } from "@thefix/engine";

/**
 *
 * The match always runs off the in-memory Room; Redis just holds a durable
 * COPY of the same event log the Room already keeps in `this.log`. That's the
 * payoff of the engine being event-sourced: on a crash or deploy we reload
 * these logs and fold them back through `reduce` to rebuild every room exactly
 * as it was.
 */

const ROOMS_KEY = "thefix:rooms"; // SET of live room codes
const logKey = (code: string) => `thefix:room:${code}:log`; // LIST of events
const fixtureKey = (code: string) => `thefix:room:${code}:fixture`; // JSON string

/** The fixture half of a room — teams, kickoff — that the event log omits. */
type RoomFixture = RoomView["fixture"];

const url = process.env.REDIS_URL;

// One shared connection. lazyConnect keeps importing this module side-effect
// free (the .connect() below opens the socket). The 'error' listener is not
// optional: without one, ioredis rethrows connection errors and takes the
// whole process down — the exact match-day crash we're here to prevent.
const client = url ? new Redis(url, { lazyConnect: true }) : null;

if (client) {
  client.on("error", (err) => console.error("[redis]", err.message));
  client
    .connect()
    .catch((err) => console.error("[redis] connect failed:", err.message));
} else {
  console.warn("[redis] REDIS_URL unset — room persistence disabled");
}

/**
 * Append one event to a room's durable log. Not awaited on purpose: apply()
 * stays synchronous, and a slow or dead Redis can never stall the match. The
 * rpush + sadd go in one round-trip so a room's code lands in the set the
 * first time it ever produces an event.
 */
export function persistEvent(code: string, ev: EngineEvent): void {
  if (!client) return;
  client
    .multi()
    .rpush(logKey(code), JSON.stringify(ev))
    .sadd(ROOMS_KEY, code)
    .exec()
    .catch((err) => console.error(`[redis] persist ${code}:`, err.message));
}

/** Drop a room's log once it's over — keeps the boot rebuild set small. */
export function forgetRoom(code: string): void {
  if (!client) return;
  client
    .multi()
    .del(logKey(code))
    .del(fixtureKey(code))
    .srem(ROOMS_KEY, code)
    .exec()
    .catch((err) => console.error(`[redis] forget ${code}:`, err.message));
}

/** Every room code we currently hold a log for. */
export async function loadRoomCodes(): Promise<string[]> {
  if (!client) return [];
  try {
    return await client.smembers(ROOMS_KEY);
  } catch (err) {
    console.error("[redis] loadRoomCodes:", (err as Error).message);
    return [];
  }
}

/** A room's full event log, oldest first — ready to fold through `reduce`. */
export async function loadRoomLog(code: string): Promise<EngineEvent[]> {
  if (!client) return [];
  try {
    const raw = await client.lrange(logKey(code), 0, -1);
    return raw.map((s) => JSON.parse(s) as EngineEvent);
  } catch (err) {
    console.error(`[redis] loadRoomLog ${code}:`, (err as Error).message);
    return [];
  }
}

/**
 * Stash a room's fixture at creation. The event log can't reconstruct this:
 * no event carries the teams/kickoff, and `reduce` needs the fixtureId to seed
 * a fresh game. A plain string SET (not the rooms Set) keyed per room.
 */
export function persistRoomFixture(code: string, fixture: RoomFixture): void {
  if (!client) return;
  client
    .set(fixtureKey(code), JSON.stringify(fixture))
    .catch((err) =>
      console.error(`[redis] persist fixture ${code}:`, err.message),
    );
}

/** The fixture stored for a room, or null if we never saw it. */
export async function loadRoomFixture(
  code: string,
): Promise<RoomFixture | null> {
  if (!client) return null;
  try {
    const raw = await client.get(fixtureKey(code));
    return raw ? (JSON.parse(raw) as RoomFixture) : null;
  } catch (err) {
    console.error(`[redis] loadRoomFixture ${code}:`, (err as Error).message);
    return null;
  }
}
