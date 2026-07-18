---
description: Coins, stakes, sealed bets, live odds, and exactly how a winning bet becomes ladder rungs.
---

# Betting & Odds

## Placing a bet

On any market card, tap **YES** or **NO**, then choose a stake with the quick chips (**1 / 2 / 5 / all-in**). That fires off a sealed bet. You can spread your 10 coins across all three markets or shove them all onto one.

<figure><img src="../.gitbook/assets/betting-stake-chips.png" alt="A market card with a YES side selected and stake chips"><figcaption><p>Pick a side, pick a stake. Coins remaining stay prominent so you always know your ammo.</p></figcaption></figure>

{% hint style="warning" %}
Highlighting a side is **not** a bet — you only bet once you pick a stake. A side you highlighted but never staked clears itself at the seal, so it never looks like a placed bet you didn't make.
{% endhint %}

## Sealed bets

Every bet is **secret**. While a segment is live, your friends can see _how many_ bets you've placed (little sealed-bet indicators on your avatar) but never _which markets_, _which side_, or _how much_. Everything unseals at once at the reveal — that shared face-up moment is the whole point.

## The stake window

You can only bet during the **stake window** — a fixed slice of match time from the moment the segment opens. When it closes, the cards stamp **SEALED** and no more bets (or fixes) go through.

{% hint style="info" %}
The stake window is **180 seconds of match time**, not wall-clock time. At real speed that's three comfortable minutes. In a 20× replay it's only about **9 real seconds**, so bet quickly. A bet sent after the seal simply doesn't count.
{% endhint %}

## Live odds

Every market is priced with **fair odds** — the payout is the true `1 ÷ probability` with **no house margin** baked in, capped at **6.0×**. The prices come from a model of how likely each event is in a 15-minute window:

* **GOAL** — based on goal-scoring rates, nudged up late in the match (goals cluster in the final stretch) and, for live matches, tuned by the market's over/under 2.5 goals line.
* **CORNERS (2+)** — anchored near a coin-flip from historical corner rates.
* **CARD** — starts calm and gets spicier as the match wears on (late games see more cards).

A shorter price (like 1.5×) means the event is likely; a longer price (like 5×) means it's a long shot that pays big if it lands.

{% hint style="info" %}
**Replays price GOAL flat.** The archive has match events but not historical odds, so replayed matches use neutral goal pricing (~0.36 probability, rising after the 75th minute). Live matches get sharp, shifting goal prices. This only affects GOAL — corners and cards never used live odds.
{% endhint %}

## From a winning bet to ladder rungs

Winning isn't about coins — coins are just ammo. Winning bets convert into **rungs on the ladder**, and the payoff scales with **how much you staked** and **how long the odds were**:

$$
\text{rungs} = \text{round}\!\left(\frac{\text{stake} \times (\text{payout} - 1)}{3}\right)
$$

Two guardrails keep it fair:

* **Floor of 1** — every winning bet climbs **at least 1 rung**, even a tiny stake at short odds. A correct call never feels like nothing happened.
* **Cap of 6** — a single market win can climb **at most 6 rungs**, so no one bet wins the game outright.

<details><summary>Worked examples</summary>

| Stake | Payout | Raw `stake × (payout−1) / 3` | Rungs climbed |
| ----- | ------ | ---------------------------- | ------------- |
| 2     | 1.6×   | 0.4 → rounds to 0            | **1** (floor) |
| 5     | 2.5×   | 2.5 → rounds to 3            | **3**         |
| 10    | 3.0×   | 6.67 → rounds to 7           | **6** (cap)   |
| 3     | 5.0×   | 4.0                          | **4**         |

Big stake + long odds = the biggest climbs, but never more than 6 from one market.

</details>

Lose a bet and nothing happens — you don't slide down for a wrong call (only a red card can push you down). See exactly how climbing works on **[The Ladder](the-ladder.md)**.
