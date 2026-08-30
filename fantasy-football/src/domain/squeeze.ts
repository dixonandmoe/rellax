import { explained, type Explained } from './explain';
import { round2 } from './scoring';
import type { LeagueConfig, Position } from './types';
import type { NextPickPrediction } from './opponent-model';
import type { Tier } from './tiers';
import type { ValuedPlayer } from './valuation';

/**
 * Pick-squeeze detection.
 *
 * A squeeze is when several teams picking before your next turn need the same position
 * *and* the remaining players in that tier are few. Either condition alone is not a
 * squeeze — six teams needing RB does not matter if 30 comparable RBs remain.
 */

export interface SqueezeAlert {
  position: Position;
  picksUntilMyNextTurn: number;
  teamsNeedingPosition: number;
  playersRemainingInTier: number;
  /** Expected number taken before your next pick. */
  expectedTaken: number;
  /** Probability at least one tier member survives to your next pick. */
  tierSurvivalProbability: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  explain: Explained<string>;
}

export function detectSqueezes(
  config: LeagueConfig,
  interveningPredictions: NextPickPrediction[],
  tiersByPosition: Map<Position, Tier[]>,
  available: ValuedPlayer[],
  /** Positions you actually care about — usually your unmet needs. */
  positionsOfInterest: Position[],
): SqueezeAlert[] {
  const picksUntilNext = interveningPredictions.length;
  const alerts: SqueezeAlert[] = [];

  for (const position of positionsOfInterest) {
    const pool = available.filter((p) => p.player.position === position);
    if (pool.length === 0) continue;

    // The tier we would be drafting from: the tier containing the best available.
    const tiers = tiersByPosition.get(position) ?? [];
    const bestAvailable = [...pool].sort((a, b) => b.projectedPoints - a.projectedPoints)[0];
    const targetTier = tiers.find((t) =>
      t.players.some((p) => p.player.id === bestAvailable?.player.id),
    );
    const tierMembers = (targetTier?.players ?? pool.slice(0, 3)).filter((p) =>
      pool.some((a) => a.player.id === p.player.id),
    );
    if (tierMembers.length === 0) continue;

    let expectedTaken = 0;
    let teamsNeeding = 0;
    for (const prediction of interveningPredictions) {
      const probability =
        prediction.distribution.find((d) => d.position === position)?.probability ?? 0;
      expectedTaken += probability;
      if (probability >= 0.25) teamsNeeding++;
    }
    expectedTaken = round2(expectedTaken);

    // Probability the whole tier is gone: model takes as independent per pick.
    const perPick = picksUntilNext > 0 ? expectedTaken / picksUntilNext : 0;
    const survival = probabilityAtLeastOneSurvives(
      perPick,
      picksUntilNext,
      tierMembers.length,
    );

    const severity: SqueezeAlert['severity'] =
      expectedTaken >= tierMembers.length && survival < 0.35
        ? 'HIGH'
        : expectedTaken >= tierMembers.length * 0.6
          ? 'MEDIUM'
          : 'LOW';

    if (severity === 'LOW') continue;

    alerts.push({
      position,
      picksUntilMyNextTurn: picksUntilNext,
      teamsNeedingPosition: teamsNeeding,
      playersRemainingInTier: tierMembers.length,
      expectedTaken,
      tierSurvivalProbability: survival,
      severity,
      explain: explained(
        severity,
        {
          picksUntilMyNextTurn: picksUntilNext,
          teamsNeedingPosition: teamsNeeding,
          playersRemainingInTier: tierMembers.length,
          expectedTaken,
          tierSurvivalProbability: survival,
        },
        `${picksUntilNext} picks until your next selection; ${teamsNeeding} of those teams likely target ${position}, ` +
          `and only ${tierMembers.length} ${position}s remain in this tier. Expected taken: ${expectedTaken}. ` +
          `Chance one survives: ${Math.round(survival * 100)}%`,
        ['opponent-model', 'tiers', 'projections'],
      ),
    });
  }

  return alerts.sort((a, b) => a.tierSurvivalProbability - b.tierSurvivalProbability);
}

/**
 * P(at least one of `tierSize` players survives `picks` picks), where each pick removes
 * a tier member with probability `perPick`.
 */
export function probabilityAtLeastOneSurvives(
  perPick: number,
  picks: number,
  tierSize: number,
): number {
  if (tierSize === 0) return 0;
  if (picks === 0) return 1;
  const p = clamp(perPick, 0, 1);
  // Expected removals follow a binomial; P(all gone) = P(removals >= tierSize).
  let pAllGone = 0;
  for (let k = tierSize; k <= picks; k++) {
    pAllGone += binomial(picks, k) * Math.pow(p, k) * Math.pow(1 - p, picks - k);
  }
  return round2(clamp(1 - pAllGone, 0, 1));
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
