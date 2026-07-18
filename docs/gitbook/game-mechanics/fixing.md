---
description: The signature mechanic — spend 2 coins to secretly sabotage a friend, and stay anonymous until full time.
---

# Fixing Your Friends

This is the mechanic the game is named for. At any point during a segment's stake window, you can **fix a friend** — a secret bet that they're about to have a _bad_ segment.

<figure><img src="../.gitbook/assets/fix-confirm.png" alt="Long-pressing a player's avatar to place a fix"><figcaption><p>Long-press a friend's avatar, confirm the 🔨, and the fix is placed — secretly.</p></figcaption></figure>

## Placing a fix

* **Long-press a friend's avatar** and confirm the 🔨.
* It costs **2 coins**.
* Only you know your target. Everyone else just sees that _some_ fix was placed this segment ("1 fix placed 👀") — never by whom, never on whom.

## How a fix resolves

At the reveal, your fix does one of two things, depending on whether your target **won anything at all** that segment:

<table><thead><tr><th width="160">Outcome</th><th width="200">When</th><th>What happens</th></tr></thead><tbody><tr><td>✅ <strong>Lands</strong></td><td>Your target won <strong>nothing</strong> this segment</td><td>You climb <strong>1–3 rungs</strong>, and it stays <strong>anonymous</strong>. You also collect a <strong>coin bonus next segment</strong>.</td></tr><tr><td>💥 <strong>Backfires</strong></td><td>Your target won <strong>anything</strong> this segment</td><td>You climb <strong>0 rungs</strong>, you're <strong>named on the spot</strong>, and you're <strong>penalized next segment</strong>.</td></tr></tbody></table>

### When a fix lands

The payoff scales with **how risky the target was to fix**:

$$
\text{rungs} = 1 + \text{round}\big(2 \times (1 - p_{\text{none}})\big)
$$

where $p_{\text{none}}$ is the chance the target wins nothing. In plain terms: fixing a **cautious favorite-backer** (who was very likely to win something) pays the full **3 rungs**; fixing a **wild gambler** (who was probably going to whiff anyway) pays the minimum **1**. Sabotaging the safe player is the sharp move.

A landed fix also pays a **+4 coin bonus** the next segment (10 → 14) — the job paid off. And it's **secret**: your stolen rungs are hidden from everyone's ladder view, and the reveal shows only _"Someone fixed …"_ to everyone but you. See [Coins & Bonuses](coins.md).

### When a fix backfires

If your target wins even a single bet, your fix blows up:

{% hint style="danger" %}
A backfired fix **names you immediately** in the reveal — _"You fixed Rahul… and Rahul WON 🔨"_ — and next segment you're **fix-locked** (you can't fix at all) with your allowance **halved to 5 coins**. The whole cost of a bad fix falls on you.
{% endhint %}

## Anonymity — the secret sauce

A **landed** fix is invisible until the very end:

* In the reveal, everyone except you sees a **nameless** fix — no fixer identity.
* Your stolen rungs are **stripped from the public ladder**, so your climb looks ordinary.
* The truth is only sealed away, never sent to other players' devices — you can't even find it by snooping.

Then, at **full time**, every landed fix is confessed on the **"The confessions"** list. That's the reckoning: all game you've been climbing on hidden sabotage, and now the room finds out who's been fixing whom. See [Full Time](full-time.md).

{% hint style="warning" %}
Because a landed fix is anonymous but a backfire is instantly named, fixing is a genuine gamble on **reading your friends**. Fix the person you think is about to have a quiet segment — get it wrong and you've outed yourself for nothing.
{% endhint %}

## Getting fixed — you get to fight back

If a fix lands on _you_, you don't just take it silently. A **[Guess Window](guess-window.md)** opens: you get a short window to name who fixed you, and guessing right pays off.
