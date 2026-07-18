---
description: The tech behind THE FIXER — a pure game engine, an authoritative room server, and a mobile web client.
---

# How It's Built

THE FIXER is a **pnpm monorepo** with a deliberately strict shape: a pure rules engine at the core, an authoritative server around it, and a thin mobile client on top. The whole design exists to protect one thing — **secrecy** — and to make sure live matches, replays, and tests all behave identically.

<figure><img src="../.gitbook/assets/architecture-diagram.png" alt="Architecture diagram: data feed to engine to server to clients"><figcaption><p>One pipeline: real match data becomes normalized events, the pure engine reduces them into game state, the server redacts secrets, and clients render their own cut.</p></figcaption></figure>

## The pieces

<table><thead><tr><th width="200">Package</th><th>Role</th></tr></thead><tbody>
<tr><td><code>packages/shared</code></td><td>Normalized match-event types (goal, corner, card, clock, phase, odds).</td></tr>
<tr><td><code>packages/engine</code></td><td>The <strong>pure</strong> game engine: <code>reduce(state, event) → state</code>. No clock, no I/O, no randomness. Every tunable number lives in one <code>config.ts</code>.</td></tr>
<tr><td><code>apps/server</code></td><td>A <strong>Fastify</strong> room server. Ingests match data, drives rooms, and fans out a redacted per-player view over WebSocket.</td></tr>
<tr><td><code>apps/web</code></td><td>A <strong>Next.js</strong> mobile-first web app. Talks to the server through one socket seam.</td></tr>
</tbody></table>

## The stack

* **Engine & server:** TypeScript, Node. Server on **Fastify 5** with `@fastify/websocket`; **ioredis** for room persistence; **zod** for input validation.
* **Web:** **Next.js 16**, **React 19**, **Tailwind**, **framer-motion** for the reveal and ladder animations. Mobile-first, ~390px viewport, installable as a PWA.
* **Audio:** the win fanfare is a **synthesized in-browser chiptune** (WebAudio) — zero audio assets, zero licensing.

## The one load-bearing idea: a single code path

Live matches, historical replays, and unit tests all produce **the same normalized event stream** into **the same pure reducer**. A room genuinely cannot tell whether a live feed or a replay is attached to it.

```
LIVE   → live score + odds streams  ─┐
REPLAY → archived match history      ─┤→  Normalizer → engine events → reduce() → state
TESTS  → recorded captures           ─┘
```

Because the engine is pure — same inputs, same outputs, always — the game is fully deterministic and testable. All the messy realities of live data (deduping, reconciling running scores, mapping status codes to phases) are handled in the **normalizer**, before anything reaches the rules.

## Secrecy is enforced on the server

The single most important architectural rule: **secrets never leave the server until they're meant to.**

* While a segment is live, sealed bets leave the server only as **counts** — never the market, side, or stake.
* At the reveal, each client receives its **own redacted cut**. A landed fix arrives **nameless** to everyone except the fixer, and the fixer's stolen rungs are stripped from that client's ladder.
* The complete truth — who fixed whom — is only sent once the game is **finished**, which is what powers the full-time confessions.

This is why you can't cheat by inspecting your device: the information you're not allowed to have was never sent to you in the first place. See [Fixing Your Friends](../game-mechanics/fixing.md) for the player-facing side of this.

## Persistence

Rooms and their event history are persisted through **Redis**, so the authoritative game state survives beyond a single in-memory process. Each room keeps its full event log, and state is rebuilt by replaying that log through the pure reducer — the same `reduce()` used everywhere else.

## Everything tunable in one place

Every number that affects game feel — coins per segment, the climb formula, the ladder height, fix costs and bonuses, the stake window, red-card behavior, pricing rates — lives in a single `config.ts`. Nothing else in the engine is allowed to hard-code a game-feel number. That's what makes the game easy to rebalance: one file, swept by a balance simulation. The values are all listed on **[Rules at a Glance](../reference/cheatsheet.md)**.

Where does the real match data come from? → **[Real Match Data](match-data.md)**.
