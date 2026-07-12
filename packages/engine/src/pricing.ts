import { CONFIG } from "./config";
import type { MarketKind, MarketPrice, OddsSummary } from "./types";

/**
 * Pricing engine v1 (PRD §6): segment-level Yes/No probabilities via Poisson,
 * scaled by the live TxLINE consensus. Payout = 1/p, capped, no margin.
 */

const round2 = (x: number) => Math.round(x * 100) / 100;

function price(pRaw: number): MarketPrice {
  const p = Math.min(Math.max(pRaw, 0.02), 0.98);
  return {
    p,
    yes: round2(Math.min(1 / p, CONFIG.payoutCap)),
    no: round2(Math.min(1 / (1 - p), CONFIG.payoutCap)),
  };
}

/**
 * Price the three markets at segment open.
 * - GOAL: Poisson λ scaled by market's total-goals belief (P(over 2.5)=0.5
 *   is neutral) and a late-game multiplier from 75'.
 * - CORNERS (2+): near coin-flip anchor from historical base rate.
 * - CARD: λ rises with segment index (late games get spicy).
 */
export function priceSegment(
  index: number,
  openClock: number,
  odds: OddsSummary,
): Record<MarketKind, MarketPrice> {
  const cfg = CONFIG.pricing;

  const totalsFactor = odds.overP == null ? 1 : 0.5 + odds.overP;
  const late = openClock >= 4500 ? cfg.lateGoalMultiplier : 1;
  const lambdaGoal = cfg.goalBaseLambda * totalsFactor * late;

  const lambdaCorner = cfg.cornerBaseLambda;

  const t = Math.min((index - 1) / 5, 1);
  const lambdaCard =
    cfg.cardBaseLambdaEarly + (cfg.cardBaseLambdaLate - cfg.cardBaseLambdaEarly) * t;

  return {
    GOAL: price(1 - Math.exp(-lambdaGoal)),
    // P(X >= 2) = 1 - e^-λ - λe^-λ
    CORNERS: price(1 - Math.exp(-lambdaCorner) * (1 + lambdaCorner)),
    CARD: price(1 - Math.exp(-lambdaCard)),
  };
}
