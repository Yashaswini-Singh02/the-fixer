// End-to-end check: two players join a room, start it, bet every segment,
// and we watch markets open / reveals fire / the game finish.
//
// Usage:
//   1. pnpm serve
//   2. curl -s -X POST localhost:8080/api/rooms -H 'content-type: application/json' \
//        -d '{"fixtureId":"<id from GET /api/fixtures>","speed":300}'
//   3. node apps/server/scripts/e2e-room.mjs <roomCode>
//
// Needs Node >= 22 (built-in WebSocket). Exits 0 when the game finishes,
// 1 on the 240s timeout.
const roomCode = process.argv[2];
if (!roomCode) throw new Error("usage: node e2e-room.mjs ROOMCODE");

const log = (...a) => console.log(new Date().toISOString().slice(14, 23), ...a);

function player(id, name, emoji, { organizer = false, better }) {
  const ws = new WebSocket("ws://localhost:8080/ws");
  const betSegments = new Set();
  let lastStatus = "";
  ws.onopen = () =>
    ws.send(JSON.stringify({ type: "hello", roomCode, playerId: id, name, emoji }));
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.type === "view") {
      const s = msg.view.state;
      if (s.status !== lastStatus) {
        lastStatus = s.status;
        log(`[${name}] status -> ${s.status}`);
        if (s.status === "finished") {
          const ranks = Object.values(s.players)
            .map((p) => `${p.name}:${p.rung}`)
            .join(" ");
          log(`[${name}] FINAL winner=${s.winnerId ?? "tie"} rungs: ${ranks}`);
          if (name === "Ana") {
            done = true;
            process.exitCode = 0;
            setTimeout(() => process.exit(0), 500);
          }
        }
        if (s.status === "lobby" && organizer && !started) {
          // give player 2 a moment to join, then kick off
          setTimeout(() => {
            started = true;
            log(`[${name}] sending start`);
            ws.send(JSON.stringify({ type: "start" }));
          }, 1500);
        }
      }
      const seg = s.segment;
      if (seg && !seg.sealed && !betSegments.has(seg.index)) {
        betSegments.add(seg.index);
        if (name === "Ana") {
          log(
            `[markets] segment ${seg.index} OPEN @clock ${s.clockSec}s — prices ` +
              Object.entries(seg.prices)
                .map(([m, p]) => `${m} p=${p.p} yes=${p.yes} no=${p.no}`)
                .join(" | "),
          );
        }
        for (const b of better(seg)) {
          ws.send(JSON.stringify(b));
          log(`[${name}] -> ${b.type} ${b.market ?? b.targetId ?? ""} ${b.side ?? ""} ${b.stake ?? ""}`);
        }
      }
    }
    if (msg.type === "reveal" && name === "Ana") {
      const r = msg.result;
      log(
        `[reveal] segment ${r.index} outcomes=${JSON.stringify(r.outcomes)} climbs=${JSON.stringify(
          r.climbs,
        )} bets-unsealed=${msg.bets.length} fixes=${r.fixes.length}`,
      );
    }
    if (msg.type === "error") log(`[${name}] ERROR ${msg.code}: ${msg.message}`);
  };
  return ws;
}

let started = false;
let done = false;

player("p-ana", "Ana", "🦊", {
  organizer: true,
  better: (seg) => [
    { type: "bet", market: "GOAL", side: "YES", stake: 5 },
    { type: "bet", market: "CORNERS", side: "YES", stake: 3 },
  ],
});
setTimeout(
  () =>
    player("p-raj", "Raj", "🐼", {
      better: (seg) => [
        { type: "bet", market: "CARD", side: "YES", stake: 4 },
        { type: "fix", targetId: "p-ana" },
      ],
    }),
  400,
);

setTimeout(() => {
  if (!done) {
    log("TIMEOUT — game did not finish in 240s");
    process.exit(1);
  }
}, 240_000);
