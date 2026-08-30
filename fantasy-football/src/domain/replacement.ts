import { explained, type Explained } from './explain';
import { flexShare, leagueStartingSlots } from './league-config';
import type { LeagueConfig, Position } from './types';

/**
 * Replacement level, derived from the league's own lineup requirements.
 *
 * This is the single most important number in the app and the reason a 2-QB league
 * behaves differently from a 1-QB league. In an 8-team league with 2 starting QBs, 16 QBs
 * start every week, so the replacement QB is QB17-ish — not QB9. The gap between QB5 and
 * QB17 is enormous; the gap between QB5 and QB9 is not. Everything downstream (VOR,
 * scarcity, draft value, trade value) inherits that difference automatically.
 */

/**
 * How deep past the last starter the "next man up" realistically is.
 *
 * Managers carry backups, so the true replacement is slightly deeper than the number of
 * starting slots. We add a fraction of a bench spot per team for positions people stash,
 * and none for K/DST which are streamed.
 */
export const BENCH_ALLOWANCE: Record<Position, number> = {
  QB: 0.35,
  RB: 0.9,
  WR: 0.9,
  TE: 0.3,
  K: 0,
  DST: 0,
};

export interface ReplacementLevel {
  position: Position;
  /** 1-indexed rank at that position that defines replacement level. */
  rank: number;
  /** Projected points of the player at that rank, if the pool is deep enough. */
  points: number | null;
  explain: Explained<number>;
}

/** The rank that defines replacement level for a position in this league. */
export function replacementRank(config: LeagueConfig, position: Position): number {
  const starters = leagueStartingSlots(config, position);
  const flex = flexShare(config, position);
  const bench = BENCH_ALLOWANCE[position] * config.teamCount;
  return Math.max(1, Math.round(starters + flex + bench));
}

export function replacementRankExplained(
  config: LeagueConfig,
  position: Position,
): Explained<number> {
  const starters = leagueStartingSlots(config, position);
  const flex = flexShare(config, position);
  const bench = BENCH_ALLOWANCE[position] * config.teamCount;
  const rank = Math.max(1, Math.round(starters + flex + bench));
  return explained(
    rank,
    {
      teams: config.teamCount,
      dedicatedStartersPerTeam: config.lineup[position as keyof typeof config.lineup] ?? 0,
      leagueStartingSlots: starters,
      expectedFlexSlots: round2(flex),
      benchAllowance: round2(bench),
    },
    `replacementRank(${position}) = round(${starters} starters + ${round2(flex)} flex + ${round2(bench)} bench) = ${rank}`,
    ['league-config'],
  );
}

/**
 * Replacement level points, taken from the *available* pool.
 *
 * During a draft the pool drains, so replacement level rises as good players come off the
 * board. Passing the remaining pool (rather than the full preseason pool) is what makes
 * scarcity dynamic.
 */
export function computeReplacementLevel(
  config: LeagueConfig,
  position: Position,
  /** Projected points for every player at this position, any order. */
  pointsByRank: number[],
): ReplacementLevel {
  const rank = replacementRank(config, position);
  const sorted = [...pointsByRank].sort((a, b) => b - a);
  const rankExplain = replacementRankExplained(config, position);

  if (sorted.length === 0) {
    return {
      position,
      rank,
      points: null,
      explain: explained(
        0,
        { ...rankExplain.inputs, poolSize: 0 },
        `no ${position} projections available — replacement level unknown`,
        ['league-config'],
      ),
    };
  }

  // If the pool is shallower than the replacement rank, the shallowest player available
  // *is* replacement level: there is literally nobody behind them.
  const index = Math.min(rank, sorted.length) - 1;
  const points = sorted[index] ?? sorted[sorted.length - 1] ?? 0;

  return {
    position,
    rank,
    points,
    explain: explained(
      points,
      { ...rankExplain.inputs, poolSize: sorted.length, usedRank: index + 1 },
      `${rankExplain.formula}; ${position}${index + 1} in the remaining pool projects ${round2(points)} pts`,
      ['league-config', 'projections'],
    ),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
