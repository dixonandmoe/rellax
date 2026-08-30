import { round2 } from './scoring';
import { toLetterGrade } from './team-grade';
import type { LeagueConfig } from './types';

/**
 * Front Office grading.
 *
 * Grades *decisions*, not outcomes where possible: a draft pick is graded against what
 * else was on the board at that pick, a FAAB bid against what the player actually
 * returned per dollar. Luck is not skill, and the app should not tell you a lucky bid was
 * a good one.
 */

export interface DraftDecision {
  overall: number;
  playerId: string;
  playerName: string;
  /** Season points the player actually produced (or projected, preseason). */
  actualPoints: number;
  /** Best available alternative's actual points at that pick. */
  bestAvailablePoints: number;
  /** ADP at the time, if known. */
  adp?: number;
}

export interface WaiverDecision {
  week: number;
  playerId: string;
  playerName: string;
  bid: number;
  /** Points the player produced for us after acquisition. */
  pointsAdded: number;
  /** Points a freely-available replacement would have produced. */
  replacementPoints: number;
}

export interface TradeDecision {
  week: number;
  description: string;
  /** Net starting-lineup points gained across the rest of the season. */
  netPointsGained: number;
}

export interface LineupDecision {
  week: number;
  /** Points our actual lineup scored. */
  actualPoints: number;
  /** Points the optimal lineup would have scored. */
  optimalPoints: number;
}

export interface FrontOfficeGrade {
  draft: { score: number; grade: string; valueGained: number; detail: string };
  waivers: { score: number; grade: string; valueGained: number; detail: string };
  trades: { score: number; grade: string; valueGained: number; detail: string };
  lineups: { score: number; grade: string; pointsLeftOnBench: number; detail: string };
  faab: { score: number; grade: string; pointsPerDollar: number | null; detail: string };
  overall: { score: number; grade: string };
  bestDecision: string | null;
  worstDecision: string | null;
}

export function gradeFrontOffice(
  config: LeagueConfig,
  input: {
    draft: DraftDecision[];
    waivers: WaiverDecision[];
    trades: TradeDecision[];
    lineups: LineupDecision[];
    faabBudget?: number;
  },
): FrontOfficeGrade {
  const budget = input.faabBudget ?? config.faabBudget;

  // Draft: points gained versus the best alternative at each pick.
  const draftValue = input.draft.reduce(
    (sum, pick) => sum + (pick.actualPoints - pick.bestAvailablePoints),
    0,
  );
  const draftPerPick = input.draft.length ? draftValue / input.draft.length : 0;
  const draftScore = scoreFromMargin(draftPerPick, 12);

  // Waivers: points above replacement added by pickups.
  const waiverValue = input.waivers.reduce(
    (sum, claim) => sum + (claim.pointsAdded - claim.replacementPoints),
    0,
  );
  const waiverScore = scoreFromMargin(waiverValue / 25, 1);

  // Trades: net starting points gained.
  const tradeValue = input.trades.reduce((sum, trade) => sum + trade.netPointsGained, 0);
  const tradeScore = scoreFromMargin(tradeValue / 20, 1);

  // Lineups: how much we left on the bench.
  const left = input.lineups.reduce(
    (sum, week) => sum + Math.max(0, week.optimalPoints - week.actualPoints),
    0,
  );
  const perWeekLeft = input.lineups.length ? left / input.lineups.length : 0;
  // 0 points left = 100; 15 points/week left = 0.
  const lineupScore = round2(clamp(100 - (perWeekLeft / 15) * 100, 0, 100));

  // FAAB efficiency: points above replacement per dollar spent.
  const spent = input.waivers.reduce((sum, claim) => sum + claim.bid, 0);
  const pointsPerDollar = spent > 0 ? round2(waiverValue / spent) : null;
  const faabScore =
    pointsPerDollar === null
      ? spent === 0 && budget > 0
        ? 45 // never bidding is not neutral: unspent budget is wasted resource
        : 50
      : scoreFromMargin(pointsPerDollar, 1.5);

  const overall = round2(
    0.3 * draftScore + 0.2 * waiverScore + 0.15 * tradeScore + 0.2 * lineupScore + 0.15 * faabScore,
  );

  const best = [...input.draft]
    .map((d) => ({
      label: `Drafting ${d.playerName} at pick ${d.overall}`,
      margin: d.actualPoints - d.bestAvailablePoints,
    }))
    .concat(
      input.waivers.map((w) => ({
        label: `Acquiring ${w.playerName} in week ${w.week} for $${w.bid}`,
        margin: w.pointsAdded - w.replacementPoints,
      })),
    )
    .sort((a, b) => b.margin - a.margin);

  return {
    draft: {
      score: draftScore,
      grade: toLetterGrade(draftScore),
      valueGained: round2(draftValue),
      detail: `${round2(draftPerPick)} points per pick versus the best alternative on the board at that slot.`,
    },
    waivers: {
      score: waiverScore,
      grade: toLetterGrade(waiverScore),
      valueGained: round2(waiverValue),
      detail: `${round2(waiverValue)} points above replacement added through ${input.waivers.length} claims.`,
    },
    trades: {
      score: tradeScore,
      grade: toLetterGrade(tradeScore),
      valueGained: round2(tradeValue),
      detail: `${round2(tradeValue)} net starting-lineup points across ${input.trades.length} trades.`,
    },
    lineups: {
      score: lineupScore,
      grade: toLetterGrade(lineupScore),
      pointsLeftOnBench: round2(left),
      detail: `${round2(perWeekLeft)} points per week left on your bench.`,
    },
    faab: {
      score: faabScore,
      grade: toLetterGrade(faabScore),
      pointsPerDollar,
      detail:
        pointsPerDollar === null
          ? `No FAAB spent out of $${budget}.`
          : `${pointsPerDollar} points above replacement per FAAB dollar ($${spent} of $${budget} spent).`,
    },
    overall: { score: overall, grade: toLetterGrade(overall) },
    bestDecision: best[0] && best[0].margin > 0 ? best[0].label : null,
    worstDecision:
      best.length > 0 && best[best.length - 1]!.margin < 0 ? best[best.length - 1]!.label : null,
  };
}

/** Map a margin to 0-100 where 0 margin = 50 and `scale` margin = ~90. */
function scoreFromMargin(margin: number, scale: number): number {
  if (scale === 0) return 50;
  return round2(clamp(50 + (margin / scale) * 40, 0, 100));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
