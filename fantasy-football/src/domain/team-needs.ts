import { explained, type Explained } from './explain';
import { optimalLineup } from './lineup';
import { replacementRank } from './replacement';
import { round2 } from './scoring';
import type { FantasyTeam, LeagueConfig, Position } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * Per-team positional need inference.
 *
 * Need is measured as the gap between what a team currently starts at a position and what
 * a competent starter at that position looks like in this league — plus an unfilled-slot
 * penalty. A team with two elite QBs in a 2-QB league has zero QB need even though QB is
 * the most valuable position; a team with one QB has an urgent need.
 */

export type TradeStance = 'BUY' | 'SELL' | 'STAND_PAT';

export interface TeamNeedsReport {
  teamId: string;
  /** 0-1 per position; 1 = urgent. */
  needByPosition: Record<string, number>;
  needOrder: Position[];
  surplus: Position[];
  starterStrengthByPosition: Record<string, number>;
  tradeStance: TradeStance;
  unfilledSlots: string[];
  explain: Explained<string>;
}

export function computeTeamNeeds(
  config: LeagueConfig,
  team: FantasyTeam,
  values: Map<string, ValuedPlayer>,
  /** League-wide valued pool, used to define "what a starter looks like here". */
  allValued: ValuedPlayer[],
  options: { leagueAverageByPosition?: Map<Position, number> } = {},
): TeamNeedsReport {
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  const lineup = optimalLineup(config, team.roster, values);

  const benchmarks =
    options.leagueAverageByPosition ?? startingCaliberBenchmarks(config, allValued);
  const gaps = positionValueGaps(config, allValued);

  const needByPosition: Record<string, number> = {};
  const starterStrength: Record<string, number> = {};
  const surplus: Position[] = [];

  // The largest startable-vs-replacement gap in the league sets the scale, so needs at
  // different positions are directly comparable.
  const maxGap = Math.max(1, ...[...gaps.values()].map((g) => g.gap));

  for (const position of positions) {
    const required = requiredStarters(config, position);
    if (required === 0) {
      needByPosition[position] = 0;
      continue;
    }

    const owned = team.roster
      .map((entry) => values.get(entry.playerId))
      .filter((v): v is ValuedPlayer => v?.player.position === position)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);

    const gap = gaps.get(position);
    const benchmark = gap?.benchmark ?? benchmarks.get(position) ?? 0;
    const replacement = gap?.replacement ?? 0;
    const positionGap = gap?.gap ?? 0;

    const startersOwned = owned.slice(0, required);
    starterStrength[position] = round2(
      startersOwned.length > 0
        ? startersOwned.reduce((s, p) => s + p.projectedPoints, 0) / startersOwned.length
        : 0,
    );

    /**
     * Need is a value shortfall, not a slot count. For each required slot we ask how far
     * below a startable player this team is, treating an empty slot as filled by the
     * freely-available replacement (because it always can be). The shortfall at any one
     * slot is capped at the position's own startable-vs-replacement gap, so a position
     * where upgrading buys almost nothing — a kicker — can never outrank a missing QB2.
     */
    let shortfall = 0;
    for (let slot = 0; slot < required; slot++) {
      const points = owned[slot]?.projectedPoints ?? replacement;
      shortfall += clamp01Range(benchmark - points, 0, positionGap);
    }

    const need = clamp01(shortfall / (required * maxGap));
    needByPosition[position] = round2(need);

    // Surplus: more startable-quality players than slots to start them.
    const startableCount = owned.filter((p) => p.projectedPoints >= benchmark).length;
    if (startableCount > required + 1) surplus.push(position);
  }

  const needOrder = positions
    .filter((p) => (needByPosition[p] ?? 0) > 0)
    .sort((a, b) => (needByPosition[b] ?? 0) - (needByPosition[a] ?? 0));

  const stance = inferTradeStance(config, team, needOrder, surplus, needByPosition);

  return {
    teamId: team.id,
    needByPosition,
    needOrder,
    surplus,
    starterStrengthByPosition: starterStrength,
    tradeStance: stance,
    unfilledSlots: lineup.unfilledSlots,
    explain: explained(
      stance,
      {
        topNeed: needOrder[0] ?? 'none',
        topNeedScore: needByPosition[needOrder[0] ?? ''] ?? 0,
        surplusPositions: surplus.join(',') || 'none',
        unfilledSlots: lineup.unfilledSlots.join(',') || 'none',
        record: `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}`,
      },
      needOrder.length > 0
        ? `Biggest hole is ${needOrder[0]} (${Math.round((needByPosition[needOrder[0]!] ?? 0) * 100)}% need)` +
          (surplus.length ? `; surplus at ${surplus.join(', ')}` : '')
        : 'No material positional holes',
      ['rosters', 'projections', 'league-config'],
    ),
  };
}

export interface PositionValueGap {
  /** Points a startable player at this position projects in this league. */
  benchmark: number;
  /** Points the freely-available replacement projects. */
  replacement: number;
  /** benchmark - replacement: what upgrading this position actually buys you. */
  gap: number;
}

/**
 * What upgrading each position is worth, in points.
 *
 * This is the number that makes the model say "you need a QB2" rather than "you need a
 * kicker" in a 2-QB league, without hard-coding anything about kickers: the gap between
 * a startable kicker and the next kicker on the wire is a couple of points, while the
 * gap between a startable QB and the 17th-best QB is enormous when 16 QBs start weekly.
 */
export function positionValueGaps(
  config: LeagueConfig,
  allValued: ValuedPlayer[],
): Map<Position, PositionValueGap> {
  const benchmarks = startingCaliberBenchmarks(config, allValued);
  const result = new Map<Position, PositionValueGap>();

  const positions = new Set(allValued.map((p) => p.player.position));
  for (const position of positions) {
    const pool = allValued
      .filter((p) => p.player.position === position)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    const rank = replacementRank(config, position);
    const replacement =
      pool[Math.min(rank, pool.length) - 1]?.projectedPoints ??
      pool[pool.length - 1]?.projectedPoints ??
      0;
    const benchmark = benchmarks.get(position) ?? 0;
    result.set(position, {
      benchmark,
      replacement,
      gap: Math.max(0, benchmark - replacement),
    });
  }

  return result;
}

/** Starters this league requires at a position, counting an expected flex share. */
export function requiredStarters(config: LeagueConfig, position: Position): number {
  const dedicated = config.lineup[position as keyof typeof config.lineup] ?? 0;
  const flexBonus =
    config.flexEligibility.includes(position) && config.lineup.FLEX > 0 ? 1 : 0;
  const superflexBonus =
    config.superflexEligibility.includes(position) && config.lineup.SUPERFLEX > 0 && position === 'QB'
      ? 1
      : 0;
  return dedicated + (position === 'RB' || position === 'WR' ? flexBonus : 0) + superflexBonus;
}

/**
 * What a "startable" player projects at each position in this league — the points of the
 * player at the last dedicated starting slot league-wide.
 */
export function startingCaliberBenchmarks(
  config: LeagueConfig,
  allValued: ValuedPlayer[],
): Map<Position, number> {
  const result = new Map<Position, number>();
  const positions = new Set(allValued.map((p) => p.player.position));
  for (const position of positions) {
    const pool = allValued
      .filter((p) => p.player.position === position)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    // Use the midpoint between the top starter and replacement as "startable".
    const rank = replacementRank(config, position);
    const index = Math.min(Math.max(1, Math.floor(rank * 0.6)), pool.length) - 1;
    result.set(position, pool[index]?.projectedPoints ?? 0);
  }
  return result;
}

/**
 * Buy / sell / stand pat.
 *
 * A team buys when it is contending and has a fixable hole plus surplus to trade from;
 * it sells when it is out of contention; otherwise it stands pat.
 */
export function inferTradeStance(
  config: LeagueConfig,
  team: FantasyTeam,
  needOrder: Position[],
  surplus: Position[],
  needByPosition: Record<string, number>,
): TradeStance {
  const gamesPlayed = team.wins + team.losses + team.ties;
  const winRate = gamesPlayed > 0 ? (team.wins + team.ties * 0.5) / gamesPlayed : 0.5;
  const weeksLeft = Math.max(0, config.regularSeasonWeeks - gamesPlayed);
  const playoffShare = config.playoffTeams / config.teamCount;

  const topNeed = needByPosition[needOrder[0] ?? ''] ?? 0;
  const hasSurplus = surplus.length > 0;

  // Preseason / early: everyone is a buyer if they have an obvious imbalance.
  if (gamesPlayed < 3) {
    return topNeed > 0.3 && hasSurplus ? 'BUY' : 'STAND_PAT';
  }

  const contending = winRate >= playoffShare * 0.9;
  const eliminated = weeksLeft > 0 && winRate < playoffShare * 0.5;

  if (eliminated) return 'SELL';
  if (contending && topNeed > 0.25 && hasSurplus) return 'BUY';
  if (contending && topNeed > 0.4) return 'BUY';
  return 'STAND_PAT';
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function clamp01Range(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
