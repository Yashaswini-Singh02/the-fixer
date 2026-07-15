import type { PublicPlayer, RoomView } from "@thefix/engine";
import { CONFIG } from "@thefix/engine";

/** One segment's contribution to your climb. */
export interface ClimbRow {
  index: number;
  rungs: number;
}

/** A fix YOU placed on someone. */
export interface JobRow {
  index: number;
  target: PublicPlayer | undefined;
  /** true = you climbed; false = it backfired and they cashed */
  succeeded: boolean;
  rungs: number;
}

/** A fix placed on YOU. */
export interface OnYouRow {
  index: number;
  /** null while a landed fix is still anonymous — the name unseals at full time */
  fixer: PublicPlayer | null;
  /** true = it landed (you won nothing); false = you cashed and exposed them */
  succeeded: boolean;
  rungs: number;
}

/** Everything the "Your File" panel shows — derived purely from the redacted
 *  history the client already holds. No extra storage, no server round-trip. */
export interface Dossier {
  you: PublicPlayer | undefined;
  rung: number;
  ladderTop: number;
  /** 1-based standing on the ladder (ties share the higher rank) */
  rank: number;
  totalPlayers: number;
  coins: number;
  segmentsPlayed: number;
  totalClimb: number;
  climbs: ClimbRow[];
  bestSegment: ClimbRow | null;
  /** fixes you placed, newest segment last */
  jobs: JobRow[];
  jobsLanded: number;
  /** fixes placed on you, newest segment last */
  onYou: OnYouRow[];
  onYouLanded: number;
}

export function buildDossier(view: RoomView): Dossier {
  const { state, you: youId } = view;
  const players = Object.values(state.players);
  const you = state.players[youId];
  const rung = you?.rung ?? 0;

  // rank = 1 + everyone strictly above you on the ladder
  const rank = 1 + players.filter((p) => p.rung > rung).length;

  const climbs: ClimbRow[] = state.history.map((h) => ({
    index: h.index,
    rungs: h.climbs[youId] ?? 0,
  }));
  const totalClimb = climbs.reduce((sum, c) => sum + c.rungs, 0);

  let bestSegment: ClimbRow | null = null;
  for (const c of climbs)
    if (c.rungs > 0 && (!bestSegment || c.rungs > bestSegment.rungs))
      bestSegment = c;

  const jobs: JobRow[] = [];
  const onYou: OnYouRow[] = [];
  for (const h of state.history)
    for (const f of h.fixes) {
      if (f.fixerId === youId)
        jobs.push({
          index: h.index,
          target: state.players[f.targetId],
          succeeded: f.succeeded,
          rungs: f.rungs,
        });
      if (f.targetId === youId)
        onYou.push({
          index: h.index,
          fixer: f.fixerId ? state.players[f.fixerId] ?? null : null,
          succeeded: f.succeeded,
          rungs: f.rungs,
        });
    }

  return {
    you,
    rung,
    ladderTop: CONFIG.ladderTop,
    rank,
    totalPlayers: players.length,
    coins: you?.coins ?? 0,
    segmentsPlayed: state.history.length,
    totalClimb,
    climbs,
    bestSegment,
    jobs,
    jobsLanded: jobs.filter((j) => j.succeeded).length,
    onYou,
    onYouLanded: onYou.filter((o) => o.succeeded).length,
  };
}

/** 1 → "1st", 2 → "2nd" … for the standing line. */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
