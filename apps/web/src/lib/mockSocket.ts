import {
  CONFIG,
  initGame,
  reduce,
  type ClientMsg,
  type EngineEvent,
  type GameState,
  type ServerMsg,
} from "@thefix/engine";
import { DEMO_FIXTURE } from "./fixtures";
import { projectView, type GameSocket } from "./socket";

type MatchPhase = GameState["phase"];

/**
 * MockSocket — the demo's beating heart. It holds a real GameState and drives
 * the real `reduce` with a scripted match: bots join, segments open, the clock
 * ticks, goals/corners/cards land, segments resolve. Every ServerMsg it emits
 * is byte-identical in shape to what RealSocket will deliver, so no screen can
 * tell the difference. Swap it out with NEXT_PUBLIC_MOCK=0.
 */

type Counts = Extract<EngineEvent, { kind: "goal" }>["counts"];
type Team = "home" | "away";

const BOTS = [
  { playerId: "bot-priya", name: "Priya", emoji: "🦊" },
  { playerId: "bot-rahul", name: "Rahul", emoji: "🐼" },
  { playerId: "bot-sam", name: "Sam", emoji: "🐙" },
];

const REACTIONS = ["🔥", "😱", "😭", "🤬", "🤣", "🙏"];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function zeroCounts(): Counts {
  return {
    goals: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    yellows: { home: 0, away: 0 },
    reds: { home: 0, away: 0 },
  };
}

export class MockSocket implements GameSocket {
  private state: GameState;
  private listeners = new Set<(m: ServerMsg) => void>();
  private me: { playerId: string; name: string; emoji: string } | null = null;
  private seq = 0;
  private counts = zeroCounts();
  private botsSeated = false;
  private timelineStarted = false;
  private closed = false;
  // guess window (mirrors the server: wall clock here, never in the engine)
  private guessDeadline: number | null = null;
  private guessTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private roomCode: string) {
    this.state = initGame(DEMO_FIXTURE.id);
  }

  subscribe(cb: (m: ServerMsg) => void): () => void {
    this.listeners.add(cb);
    if (this.me) cb(this.buildView());
    return () => this.listeners.delete(cb);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }

  send(msg: ClientMsg): void {
    if (this.closed) return;
    switch (msg.type) {
      case "hello": {
        this.me = {
          playerId: msg.playerId,
          name: msg.name,
          emoji: msg.emoji,
        };
        // you join first → you are the organizer who holds START
        this.apply({
          kind: "join",
          ts: Date.now(),
          playerId: msg.playerId,
          name: msg.name,
          emoji: msg.emoji,
        });
        this.seatBots();
        break;
      }
      case "start":
        if (!this.me) break;
        this.apply({
          kind: "start",
          ts: Date.now(),
          playerId: this.me.playerId,
        });
        if (this.state.status === "live" && !this.timelineStarted) {
          this.timelineStarted = true;
          void this.play();
        }
        break;
      case "bet":
        if (this.me)
          this.apply({
            kind: "bet",
            ts: Date.now(),
            playerId: this.me.playerId,
            market: msg.market,
            side: msg.side,
            stake: msg.stake,
          });
        break;
      case "fix":
        if (this.me)
          this.apply({
            kind: "fix",
            ts: Date.now(),
            playerId: this.me.playerId,
            targetId: msg.targetId,
          });
        break;
      case "guess":
        if (this.me)
          this.apply({
            kind: "guess",
            ts: Date.now(),
            playerId: this.me.playerId,
            segmentIndex: msg.segmentIndex,
            guessedFixerIds: msg.guessedFixerIds,
          });
        break;
      case "react":
        if (this.me)
          this.emit({
            type: "react",
            playerId: this.me.playerId,
            emoji: msg.emoji,
          });
        break;
    }
  }

  // ── internals ──────────────────────────────────────────────

  private emit(m: ServerMsg): void {
    if (this.closed) return;
    for (const cb of this.listeners) cb(m);
  }

  private buildView(): ServerMsg {
    return {
      type: "view",
      view: projectView(
        this.state,
        this.me?.playerId ?? "",
        this.roomCode,
        DEMO_FIXTURE,
        this.guessDeadline,
      ),
    };
  }

  /** Reduce one event; emit a reveal if a segment just resolved, then the view. */
  private apply(ev: EngineEvent): void {
    if (this.closed) return;
    const prevHistory = this.state.history.length;
    const prevGuessing = this.state.guessing;
    const resolvingBets = this.state.segment?.bets ?? [];
    this.state = reduce(this.state, ev);
    if (this.state.history.length > prevHistory) {
      const result = this.state.history[this.state.history.length - 1];
      this.emit({ type: "reveal", result, bets: resolvingBets });
    }
    this.syncGuess(prevGuessing);
    if (this.me) this.emit(this.buildView());
  }

  /** Start/stop the guess-window clock as the engine opens/closes it. */
  private syncGuess(prev: GameState["guessing"]): void {
    const now = this.state.guessing;
    if (prev && !now) {
      this.clearGuessTimer(); // engine closed the window
      return;
    }
    if (!prev && now) {
      this.guessDeadline = Date.now() + CONFIG.guessWindowSec * 1000;
      this.guessTimer = setTimeout(
        () => this.closeGuess(),
        CONFIG.guessWindowSec * 1000,
      );
      return;
    }
    if (now && now.slots.every((sl) => sl.resolved)) this.closeGuess();
  }

  /** Inject guessWindowClosed so the paused segment machine rolls on. */
  private closeGuess(): void {
    this.clearGuessTimer();
    if (this.state.guessing) {
      this.apply({ kind: "guessWindowClosed", ts: Date.now() });
    }
  }

  private clearGuessTimer(): void {
    if (this.guessTimer) clearTimeout(this.guessTimer);
    this.guessTimer = null;
    this.guessDeadline = null;
  }

  private seatBots(): void {
    if (this.botsSeated) return;
    this.botsSeated = true;
    BOTS.forEach((b, i) => {
      setTimeout(
        () =>
          this.apply({
            kind: "join",
            ts: Date.now(),
            playerId: b.playerId,
            name: b.name,
            emoji: b.emoji,
          }),
        700 + i * 1100, // trickle in so the lobby "fills live"
      );
    });
  }

  // ── event builders ─────────────────────────────────────────

  private base(clockSec: number, phase: MatchPhase) {
    return {
      fixtureId: DEMO_FIXTURE.id,
      seq: this.seq++,
      ts: Date.now(),
      clockSec,
      phase,
    };
  }
  private clockEv(clockSec: number, phase: MatchPhase): EngineEvent {
    return { ...this.base(clockSec, phase), kind: "clock" };
  }
  private phaseEv(phase: MatchPhase, clockSec: number): EngineEvent {
    return { ...this.base(clockSec, phase), kind: "phase" };
  }
  private goalEv(team: Team, clockSec: number, phase: MatchPhase): EngineEvent {
    this.counts.goals[team] += 1;
    return {
      ...this.base(clockSec, phase),
      kind: "goal",
      team,
      counts: structuredClone(this.counts),
    };
  }
  private cornerEv(
    team: Team,
    clockSec: number,
    phase: MatchPhase,
  ): EngineEvent {
    this.counts.corners[team] += 1;
    return {
      ...this.base(clockSec, phase),
      kind: "corner",
      team,
      counts: structuredClone(this.counts),
    };
  }
  private cardEv(
    team: Team,
    card: "yellow" | "red",
    clockSec: number,
    phase: MatchPhase,
  ): EngineEvent {
    if (card === "yellow") this.counts.yellows[team] += 1;
    else this.counts.reds[team] += 1;
    return {
      ...this.base(clockSec, phase),
      kind: "card",
      team,
      card,
      counts: structuredClone(this.counts),
    };
  }

  private botBet(
    playerId: string,
    market: "GOAL" | "CORNERS" | "CARD",
    side: "YES" | "NO",
    stake: number,
  ): void {
    this.apply({ kind: "bet", ts: Date.now(), playerId, market, side, stake });
  }
  private botFix(playerId: string, targetId: string): void {
    this.apply({ kind: "fix", ts: Date.now(), playerId, targetId });
  }
  private botReact(playerId: string): void {
    this.emit({
      type: "react",
      playerId,
      emoji: REACTIONS[Math.floor(Math.random() * REACTIONS.length)],
    });
  }

  /** Ramp the match clock from→to so the stake-window countdown moves live. */
  private async ramp(
    from: number,
    to: number,
    phase: MatchPhase,
    stepMs = 650,
    steps = 12,
  ): Promise<void> {
    for (let i = 1; i <= steps; i++) {
      if (this.closed) return;
      const c = Math.round(from + ((to - from) * i) / steps);
      this.apply(this.clockEv(c, phase));
      await wait(stepMs);
    }
  }

  // ── the scripted match ─────────────────────────────────────

  private async play(): Promise<void> {
    const H1: MatchPhase = "H1";
    await wait(500);

    // ── SEGMENT 1 ────────────────────────────────────────────
    this.apply(this.clockEv(0, H1)); // S1 opens, everyone gets 10 coins
    await wait(700);

    // bots stake as the window ticks down (0 → 180 = sealed)
    this.botBet("bot-priya", "GOAL", "YES", 5); // the cautious favourite-backer
    await wait(500);
    this.botFix("bot-priya", "bot-rahul"); // 🔨 Priya moves on Rahul in secret
    if (this.me) this.botFix("bot-sam", this.me.playerId); // 🔨 Sam quietly moves on YOU → surfaces (redacted) in Your File
    await this.ramp(0, 70, H1, 620, 5);
    this.botBet("bot-rahul", "CORNERS", "NO", 4);
    await this.ramp(70, 120, H1, 620, 4);
    this.botBet("bot-sam", "GOAL", "NO", 6);
    this.botBet("bot-rahul", "CARD", "YES", 3); // Rahul overreaches — both will miss
    await this.ramp(120, 180, H1, 620, 5); // window closes, bets seal
    await wait(1600);

    // the match happens (bets already sealed)
    this.apply(this.goalEv("home", 300, H1)); // ⚽ NORWAY — GOAL: YES
    this.botReact("bot-priya");
    await wait(1500);
    this.apply(this.cornerEv("home", 340, H1));
    this.apply(this.cornerEv("away", 385, H1)); // CORNERS: YES (2+)
    await wait(1200);

    // close S1 at 15' → resolve → reveal (Sam's fix on you may have landed)
    this.apply(this.clockEv(900, H1));
    await wait(6500); // let the reveal breathe

    // if a fix landed on you, the guess window is open (segment machine paused);
    // give the modal a beat to be answered, then "time it out" and roll on
    if (this.state.guessing) await wait(4500);
    this.closeGuess();

    // ── SEGMENT 2 ────────────────────────────────────────────
    this.apply(this.clockEv(900, H1)); // S2 opens (no-op if closeGuess already did)
    await wait(700);
    this.botBet("bot-rahul", "GOAL", "YES", 4);
    this.botBet("bot-sam", "CARD", "YES", 5);
    await wait(500);
    this.botFix("bot-sam", "bot-priya"); // Sam hunts Priya — this one BACKFIRES
    await this.ramp(900, 1000, H1, 620, 6);
    this.botBet("bot-priya", "CORNERS", "YES", 6); // Priya wins → fix backfires
    await this.ramp(1000, 1080, H1, 620, 6); // seal
    await wait(1600);

    this.apply(this.cornerEv("home", 1180, H1));
    this.apply(this.cornerEv("away", 1220, H1)); // CORNERS: YES → Priya wins
    await wait(1200);
    this.apply(this.cardEv("away", "yellow", 1300, H1)); // CARD: YES
    this.botReact("bot-rahul");
    await wait(1000);
    this.apply(this.clockEv(1800, H1)); // close S2 → reveal
    await wait(6500);

    // ── FULL TIME ────────────────────────────────────────────
    this.apply(this.phaseEv("FT", 5400)); // whistle → winner podium
  }
}
