---
description: >-
  The exact TxLINE integration behind THE FIXER — the on-chain Solana
  subscription that unlocks the feed, and every score, odds, and fixture
  endpoint the game reads from.
---

# Powered by TxLINE

Every outcome in THE FIXER — goals, corners, cards, the clock, the odds — is read live from **[TxLINE](https://txline.txodds.com)**, TXODDS' on-chain sports-data service on Solana. This page is the honest, technical account of exactly how the game talks to it: how it signs up on-chain, how it authenticates, and every endpoint it calls.

{% hint style="info" %}
THE FIXER runs against **devnet** by default. The same code runs on mainnet — only the API origin, program id, and token mint change (`apps/server/src/txline/config.ts`).
{% endhint %}

## Signing up on-chain (Solana)

Access to the feed isn't an API key you paste in — it's a **subscription transaction on Solana**. A service wallet calls the `subscribe` instruction on the TxLINE **`txoracle`** Anchor program, which records the subscription and creates the wallet's TXL token account (a Token-2022 associated account, created idempotently in the same transaction). That transaction's signature is the proof used to unlock API access.

<table><thead><tr><th width="200">Step</th><th>What happens</th></tr></thead><tbody>
<tr><td><strong>Subscribe</strong></td><td>On-chain <code>subscribe(serviceLevelId, durationWeeks)</code> on the <code>txoracle</code> program. Returns a transaction signature (<code>txSig</code>). — <code>txline/subscribe.ts</code></td></tr>
<tr><td><strong>Activate</strong></td><td>The wallet signs <code>{txSig}:{leagues}:{jwt}</code> and trades that proof for a durable API token. — <code>txline/activate.ts</code></td></tr>
</tbody></table>

## How the game authenticates

Two credentials work together on every request:

* A durable **`x-api-token`** header — the API token minted at activation. This is the long-lived credential.
* A short-lived **guest JWT** (`Bearer`) — minted anonymously with no credentials, sent alongside the token, and **re-minted automatically whenever a request comes back `401`**. This means a live match never dies just because a token aged out mid-game. — `txline/auth.ts`

## Every endpoint the game calls

Base API origin (devnet): `https://txline-dev.txodds.com`.

### On-chain (Solana devnet)

<table><thead><tr><th width="150">Call</th><th>Purpose</th></tr></thead><tbody>
<tr><td><code>subscribe()</code></td><td>Anchor instruction on the <code>txoracle</code> program — the subscription that unlocks the feed. Devnet program id <code>6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J</code>.</td></tr>
</tbody></table>

### HTTP &#38; SSE

<table><thead><tr><th width="90">Method</th><th>Path</th><th>Purpose</th></tr></thead><tbody>
<tr><td><code>POST</code></td><td><code>/auth/guest/start</code></td><td>Mint a short-lived anonymous guest JWT. Refreshed on <code>401</code>.</td></tr>
<tr><td><code>POST</code></td><td><code>/api/token/activate</code></td><td>Trade the signed <code>txSig</code> proof for the durable <code>x-api-token</code>.</td></tr>
<tr><td><code>GET</code></td><td><code>/api/fixtures/snapshot</code></td><td>Rolling list of current fixtures (id, participants, kickoff, competition).</td></tr>
<tr><td><code>GET</code></td><td><code>/api/scores/stream</code></td><td><strong>Live</strong> score events — goals, corners, cards, status/clock — as SSE.</td></tr>
<tr><td><code>GET</code></td><td><code>/api/odds/stream</code></td><td><strong>Live</strong> odds updates as SSE, used to price the GOAL market.</td></tr>
<tr><td><code>GET</code></td><td><code>/api/scores/historical/{fixtureId}</code></td><td>Full archived score history for a finished match, replayed at speed.</td></tr>
</tbody></table>

## How the data flows in

The live streams and the historical archive feed the **same pipeline** — raw feed → normalizer → engine events → game state — so the pure engine can't tell a live match from a replay (see [How It's Built](architecture.md)). The live streams are consumed resiliently: `Last-Event-ID` resume, exponential-backoff reconnect, an idle watchdog, and guest-JWT refresh on `401`.

{% hint style="warning" %}
**A few honest gaps in the feed, and how the game works around them:**

* There's **no dedicated "past fixtures" listing** — the snapshot is a short rolling window that forgets a match a day or two after kickoff. So the game persists its **own fixture index** from every snapshot it has ever seen.
* The **historical scores payload carries participant IDs but not names**, which is the other reason the game keeps its own index (to remember who played).
* There's **no historical odds endpoint**, so replayed matches price the GOAL market at neutral base rates while live matches get sharp, moving odds from `/api/odds/stream`.
{% endhint %}

More on the two data modes and their quirks → **[Real Match Data](match-data.md)**.
