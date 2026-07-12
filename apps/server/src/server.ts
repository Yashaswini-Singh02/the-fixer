import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import {
  SERVER_PORT,
  type ClientMsg,
} from "@thefix/engine";
import { FixtureRegistry } from "./fixtures/registry.js";
import {
  driveLive,
  fetchHistoricalScores,
  replayInto,
} from "./rooms/drivers.js";
import { Room } from "./rooms/room.js";
import { authHeaders } from "./txline/auth.js";

// auto-load .env from cwd or repo root, recorder-style
for (const p of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(resolve(p));
    break;
  } catch {
    /* keep looking */
  }
}

const API_ORIGIN =
  process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";

// every fixture the snapshot ever shows us, persisted across restarts —
// this is what lets us offer past matches the feed no longer lists
const registry = new FixtureRegistry(
  API_ORIGIN,
  fileURLToPath(new URL("../data/fixtures-seen.json", import.meta.url)),
);

// ── the server ──────────────────────────────────────────────────────

const app = Fastify();
await app.register(cors, { origin: true });
await app.register(websocket);

const rooms = new Map<string, Room>();

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
function makeCode(): string {
  for (;;) {
    const code = Array.from(
      { length: 4 },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
    if (!rooms.has(code)) return code;
  }
}

app.get("/api/fixtures", async () => registry.list());

app.post("/api/rooms", async (req, reply) => {
  const body = (req.body ?? {}) as { fixtureId?: string; speed?: number };
  const listed = await registry.byId(String(body.fixtureId ?? ""));
  if (!listed) return reply.code(404).send({ error: "unknown fixtureId" });
  const { kind, ...fixture } = listed;

  const room = new Room(makeCode(), fixture);

  if (kind === "past") {
    // pull the full match history up front — if the feed can't serve it,
    // fail the request instead of opening a lobby that will never kick off
    let items;
    try {
      items = await fetchHistoricalScores(API_ORIGIN, fixture.id);
    } catch (err) {
      return reply
        .code(502)
        .send({ error: `match history unavailable: ${(err as Error).message}` });
    }
    // the history spans days of pre-match chatter that normalizes to nothing;
    // start the tape shortly before kickoff so START leads straight into H1
    items = items.filter((i) => i.ts >= fixture.kickoff - 10 * 60_000);
    // don't start the match until the organizer presses START —
    // 20x compresses a two-hour match into ~6 minutes of party
    const speed = Math.min(Math.max(Number(body.speed) || 20, 1), 100_000);
    room.onLive = () =>
      void replayInto(room, items, speed).catch((err) =>
        console.error(`room ${room.code} historical replay died:`, err),
      );
  } else {
    // live/upcoming matches tick in real time — attach now so the lobby
    // already shows the score while friends trickle in
    driveLive(room, API_ORIGIN, (refresh) => authHeaders(API_ORIGIN, refresh));
  }

  rooms.set(room.code, room);
  return { roomCode: room.code, kind };
});

app.register(async (f) => {
  f.get("/ws", { websocket: true }, (socket) => {
    let room: Room | undefined;
    let playerId: string | undefined;

    socket.on("message", (data: Buffer) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === "hello") {
        const r = rooms.get(String(msg.roomCode ?? "").toUpperCase());
        if (!r) {
          socket.send(
            JSON.stringify({
              type: "error",
              code: "room_not_found",
              message: `no room ${msg.roomCode}`,
            }),
          );
          return;
        }
        room = r;
        playerId = String(msg.playerId);
        r.hello(socket, playerId, String(msg.name), String(msg.emoji));
        return;
      }

      if (!room || !playerId) return; // commands before hello are noise
      const ts = Date.now();
      switch (msg.type) {
        case "start":
          room.apply({ kind: "start", ts, playerId });
          break;
        case "bet":
          room.apply({
            kind: "bet",
            ts,
            playerId,
            market: msg.market,
            side: msg.side,
            stake: Number(msg.stake),
          });
          break;
        case "fix":
          room.apply({ kind: "fix", ts, playerId, targetId: String(msg.targetId) });
          break;
        case "react":
          room.react(playerId, String(msg.emoji).slice(0, 8));
          break;
      }
    });

    socket.on("close", () => room?.detach(socket));
  });
});

const address = await app.listen({ port: SERVER_PORT, host: "0.0.0.0" });
const fixtures = await registry.list();
console.log(
  `THE FIX room server on ${address} — ${fixtures.filter((f) => f.kind === "past").length} past / ${fixtures.filter((f) => f.kind !== "past").length} current fixtures known`,
);
