---
description: Where the real football comes from — the live feed, historical replays, and their quirks.
---

# Real Match Data

Nothing in THE FIXER is faked. Goals, corners, cards, the clock, half time, red cards — every outcome is read from a **real sports data feed**. That's what makes the reveals land: the match on your TV _is_ the game.

## Two ways a match reaches the game

<table><thead><tr><th width="160">Mode</th><th>Source</th><th>What it feels like</th></tr></thead><tbody>
<tr><td><strong>Live</strong></td><td>Live score &#38; odds streams</td><td>Segments open in real time as the match plays out. Odds shift segment to segment.</td></tr>
<tr><td><strong>Replay</strong></td><td>The match's archived history</td><td>A finished match re-run at speed (default 20×). Fast-forwards to just before kick-off so there's no dead air.</td></tr>
</tbody></table>

Both feed the **same pipeline**: raw feed → normalizer → engine events → game state. The engine can't tell them apart (see [How It's Built](architecture.md)). For the exact endpoints behind each mode, see [Powered by TxLINE](txline.md).

## Replay speed

Replays run at a configurable speed. Because the stake window is measured in **match time**, speed directly controls how long you get to bet:

<table><thead><tr><th width="140">Speed</th><th width="200">Stake window (real time)</th><th>Good for</th></tr></thead><tbody>
<tr><td><strong>20×</strong> (default)</td><td>~9 seconds</td><td>A fast party round — a full match in ~6 minutes.</td></tr>
<tr><td><strong>2–4×</strong></td><td>45–90 seconds</td><td>A relaxed game with time to think about every bet.</td></tr>
<tr><td><strong>Live (1×)</strong></td><td>3 minutes</td><td>Watching a real match unfold.</td></tr>
</tbody></table>

## Known quirks

A few honest limitations, worth knowing so nothing looks broken:

{% hint style="info" %}
**Replayed matches price GOAL flat.** The archive stores what _happened_ in a match but not the _odds_ that were live at the time, so replays fall back to neutral goal pricing (a bit steeper after the 75th minute). Live matches get sharp, moving goal odds. Corners and cards are priced the same either way.
{% endhint %}

{% hint style="info" %}
**A just-finished match may not be replayable immediately.** There's a short window right after full time before a match becomes available in the historical archive. During that gap it can still show as "live" and sit on the final score.
{% endhint %}

{% hint style="warning" %}
**Some very old matches can't be listed by name.** The game only knows the names of matches it has seen in the live schedule. A match old enough to have dropped out of the schedule may still be playable data-wise but won't appear in the list.
{% endhint %}

## Why segments follow the match clock

Everything in the game — when a segment opens, how long the stake window lasts, when the reveal fires — is driven by the **match clock**, not real-world seconds. This is the single decision that lets one match play at real speed for a live game and at 20× for a party without changing any rules. The match is the metronome.
