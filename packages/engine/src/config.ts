/**
 * Every tunable game constant lives here (PRD §5.7).
 * The balance simulation sweeps these; nothing else in the engine
 * may hard-code a number that affects game feel.
 */
export const CONFIG = {
  /** coins granted to every player at each segment open */
  segmentAllowance: 10,
  /** rungs = round(stake * (payout - 1) / climbDivisor) */
  climbDivisor: 3,
  /** every winning bet climbs at least this many rungs — small stakes at
   *  short odds would otherwise round to zero and feel like a dead win */
  rungFloorPerWin: 1,
  /** max rungs a single market win can award */
  rungCapPerMarket: 6,
  /** ladder height — first to this rung wins */
  ladderTop: 20,
  /** coins to place a fix on another player */
  fixCost: 2,
  /** payout = 1/p, capped here (fair odds, no margin) */
  payoutCap: 6.0,
  /** stake window length from segment open, seconds */
  stakeWindowSec: 180,
  /** red card: everyone above this rung slides down 1 */
  redCardSlideAboveRung: 10,
  /** pricing engine base rates, per 15-min segment */
  pricing: {
    goalBaseLambda: 0.45,
    cornerBaseLambda: 1.7,
    cardBaseLambdaEarly: 0.5,
    cardBaseLambdaLate: 1.0,
    /** goals cluster late: multiplier applied from 75' */
    lateGoalMultiplier: 1.25,
  },
} as const;

export type GameConfig = typeof CONFIG;
