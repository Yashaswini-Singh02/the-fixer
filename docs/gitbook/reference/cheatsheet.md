---
description: Every number that matters, on one page.
---

# Rules at a Glance

The whole ruleset in tables. For the "why," follow the links into [Game Mechanics](../game-mechanics/segments-and-markets.md).

## The room

<table><thead><tr><th width="280">Rule</th><th>Value</th></tr></thead><tbody>
<tr><td>Players per room</td><td>2–8</td></tr>
<tr><td>Room code</td><td>4 letters</td></tr>
<tr><td>Host</td><td>First to join; only one who can kick off</td></tr>
</tbody></table>

## Segments & markets

<table><thead><tr><th width="280">Rule</th><th>Value</th></tr></thead><tbody>
<tr><td>Segment length</td><td>15 minutes of match time</td></tr>
<tr><td>Segments</td><td>1–6 regulation, 7–8 extra time</td></tr>
<tr><td>Markets per segment</td><td>⚽ GOAL (1+) · 🚩 CORNERS (2+) · 🟨 CARD (1+)</td></tr>
<tr><td>GOAL resolves YES</td><td>≥ 1 goal in the segment</td></tr>
<tr><td>CORNERS resolves YES</td><td>≥ 2 corners in the segment</td></tr>
<tr><td>CARD resolves YES</td><td>≥ 1 card in the segment</td></tr>
</tbody></table>

## Coins & betting

<table><thead><tr><th width="280">Rule</th><th>Value</th></tr></thead><tbody>
<tr><td>Base coins per segment</td><td>10 (unspent coins vanish)</td></tr>
<tr><td>Stake window</td><td>180 match-seconds from segment open</td></tr>
<tr><td>Payout</td><td>Fair odds (1 ÷ probability), no margin, capped 6.0×</td></tr>
<tr><td>Rungs from a winning bet</td><td>round(stake × (payout − 1) ÷ 3)</td></tr>
<tr><td>Minimum climb per win</td><td>1 rung</td></tr>
<tr><td>Maximum climb per market</td><td>6 rungs</td></tr>
</tbody></table>

## Fixing

<table><thead><tr><th width="280">Rule</th><th>Value</th></tr></thead><tbody>
<tr><td>Fix cost</td><td>2 coins</td></tr>
<tr><td>Landed fix — rungs</td><td>1–3 (scales with how likely the target was to win)</td></tr>
<tr><td>Landed fix — coin bonus</td><td>+4 next segment (10 → 14)</td></tr>
<tr><td>Landed fix — secrecy</td><td>Anonymous until full time</td></tr>
<tr><td>Backfire — rungs</td><td>0</td></tr>
<tr><td>Backfire — exposure</td><td>Fixer named immediately</td></tr>
<tr><td>Backfire — penalty</td><td>Next segment: allowance halved (10 → 5) + fix-locked</td></tr>
</tbody></table>

## Guess window

<table><thead><tr><th width="280">Rule</th><th>Value</th></tr></thead><tbody>
<tr><td>Opens when</td><td>A fix lands on you</td></tr>
<tr><td>Duration</td><td>30 seconds (pauses the game)</td></tr>
<tr><td>Threshold</td><td>"Miss at most one" (1→1, 2→1, 3→2, 4→3 correct)</td></tr>
<tr><td>Correct guess — coin bonus</td><td>+2 next segment (10 → 12)</td></tr>
<tr><td>Bonuses stack</td><td>Land a fix + guess your fixer = 16 next segment</td></tr>
</tbody></table>

## Ladder & endgame

<table><thead><tr><th width="280">Rule</th><th>Value</th></tr></thead><tbody>
<tr><td>Ladder height</td><td>20 rungs</td></tr>
<tr><td>Instant win</td><td>First to rung 20</td></tr>
<tr><td>Otherwise</td><td>Highest at full time; exact tie = draw</td></tr>
<tr><td>Red card</td><td>Everyone above rung 10 slides down 1</td></tr>
</tbody></table>

## Replay speed

<table><thead><tr><th width="280">Setting</th><th>Effect</th></tr></thead><tbody>
<tr><td>Default replay speed</td><td>10× (a full match in ~9 minutes; ~18-second stake windows)</td></tr>
<tr><td>Slower (2–4×)</td><td>45–90-second stake windows — best for a relaxed UX test</td></tr>
<tr><td>Live match</td><td>Real time — three-minute stake windows</td></tr>
</tbody></table>
