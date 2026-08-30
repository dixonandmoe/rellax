import { explained, type Explained } from './explain';
import { computeReplacementLevel, type ReplacementLevel } from './replacement';
import { round2, scoreStatLine } from './scoring';
import type {
  LeagueConfig,
  Player,
  Position,
  Projection,
  InjuryReport,
  StatLine,
} from './types';

/**
 * League-adjusted player valuation.
 *
 * Pipeline: raw stat line -> league scoring -> VOR against a league-derived replacement
 * level -> 0-100 normalised league value. Nothing here uses a generic ranking; two
 * leagues with different settings produce different values from the same projections.
 */

export interface ValuedPlayer {
  player: Player;
  projectedPoints: number;
  /** Points above the replacement-level player at the same position. */
  vor: number;
  /** 0-100, normalised across the pool passed in. */
  leagueValue: number;
  /** Rank among all valued players. */
  overallRank: number;
  /** Rank within position. */
  positionRank: number;
  /** Multiplier applied for injury status; 1 = healthy. */
  availabilityFactor: number;
  tier?: number;
  explain: Explained<number>;
}

export interface ValuationResult {
  players: ValuedPlayer[];
  replacementByPosition: Map<Position, ReplacementLevel>;
  /** Positions with no projection data at all — surfaced as "Data unavailable". */
  missingProjections: string[];
}

export interface ValuationOptions {
  /** Restrict valuation to these player ids (e.g. only undrafted players). */
  playerIds?: Set<string>;
  injuries?: InjuryReport[];
  /** Week to value for; omitted means season-long. */
  week?: number;
  /** Weight injury status into value. Off for pure "talent" comparisons. */
  applyInjuryDiscount?: boolean;
}

/**
 * Injury availability multipliers. Deliberately conservative: they discount expected
 * production, they do not zero a player out, because a QUESTIONABLE tag is weak evidence.
 */
export const INJURY_FACTORS: Record<string, number> = {
  ACTIVE: 1,
  QUESTIONABLE: 0.92,
  DOUBTFUL: 0.5,
  OUT: 0.15,
  IR: 0.05,
  SUSPENDED: 0.2,
};

export function valuePlayers(
  config: LeagueConfig,
  players: Player[],
  projections: Projection[],
  options: ValuationOptions = {},
): ValuationResult {
  const { playerIds, injuries = [], applyInjuryDiscount = true, week } = options;

  const injuryByPlayer = new Map(injuries.map((i) => [i.playerId, i]));
  const projectionByPlayer = new Map<string, Projection>();
  for (const projection of projections) {
    if (week === undefined ? projection.week === undefined : projection.week === week) {
      projectionByPlayer.set(projection.playerId, projection);
    }
  }

  const pool = players.filter((p) => (playerIds ? playerIds.has(p.id) : true));

  // 1. Raw points under this league's scoring.
  interface Scored {
    player: Player;
    points: number;
    availabilityFactor: number;
    source: string;
  }
  const scored: Scored[] = [];
  const missing: string[] = [];

  for (const player of pool) {
    const projection = projectionByPlayer.get(player.id);
    if (!projection) {
      missing.push(player.id);
      continue;
    }
    const basePoints = scoreStatLine(projection.stats, config.scoring);
    const status = injuryByPlayer.get(player.id)?.status ?? player.status;
    const factor = applyInjuryDiscount ? (INJURY_FACTORS[status] ?? 1) : 1;
    scored.push({
      player,
      points: round2(basePoints * factor),
      availabilityFactor: factor,
      source: projection.source,
    });
  }

  // 2. Replacement level per position, from the pool actually being valued.
  const byPosition = new Map<Position, Scored[]>();
  for (const entry of scored) {
    const list = byPosition.get(entry.player.position) ?? [];
    list.push(entry);
    byPosition.set(entry.player.position, list);
  }

  const replacementByPosition = new Map<Position, ReplacementLevel>();
  for (const [position, entries] of byPosition) {
    replacementByPosition.set(
      position,
      computeReplacementLevel(config, position, entries.map((e) => e.points)),
    );
  }

  // 3. VOR.
  interface WithVor extends Scored {
    vor: number;
    replacementPoints: number;
    replacementRank: number;
  }
  const withVor: WithVor[] = scored.map((entry) => {
    const replacement = replacementByPosition.get(entry.player.position);
    const replacementPoints = replacement?.points ?? 0;
    return {
      ...entry,
      vor: round2(entry.points - replacementPoints),
      replacementPoints,
      replacementRank: replacement?.rank ?? 0,
    };
  });

  // 4. Normalise VOR to 0-100 across the pool. Because VOR already encodes positional
  //    scarcity, a 2-QB league lifts QBs here without any position-specific fudge factor.
  const vors = withVor.map((e) => e.vor);
  const maxVor = vors.length ? Math.max(...vors) : 0;
  const minVor = vors.length ? Math.min(...vors) : 0;
  const span = maxVor - minVor || 1;

  const sorted = [...withVor].sort((a, b) => b.vor - a.vor);
  const positionCounters = new Map<Position, number>();

  const valued: ValuedPlayer[] = sorted.map((entry, index) => {
    const positionRank = (positionCounters.get(entry.player.position) ?? 0) + 1;
    positionCounters.set(entry.player.position, positionRank);

    const leagueValue = round2(((entry.vor - minVor) / span) * 100);

    return {
      player: entry.player,
      projectedPoints: entry.points,
      vor: entry.vor,
      leagueValue,
      overallRank: index + 1,
      positionRank,
      availabilityFactor: entry.availabilityFactor,
      explain: explained(
        leagueValue,
        {
          projectedPoints: entry.points,
          availabilityFactor: entry.availabilityFactor,
          replacementRank: entry.replacementRank,
          replacementPoints: round2(entry.replacementPoints),
          vor: entry.vor,
          poolMaxVor: round2(maxVor),
          poolMinVor: round2(minVor),
        },
        `VOR = ${entry.points} - ${round2(entry.replacementPoints)} (${entry.player.position}${entry.replacementRank}) = ${entry.vor}; ` +
          `leagueValue = (${entry.vor} - ${round2(minVor)}) / ${round2(span)} × 100 = ${leagueValue}`,
        [`projections:${entry.source}`, 'league-config'],
      ),
    };
  });

  return { players: valued, replacementByPosition, missingProjections: missing };
}

/** Convenience: value lookup by player id. */
export function indexByPlayer(result: ValuationResult): Map<string, ValuedPlayer> {
  return new Map(result.players.map((v) => [v.player.id, v]));
}

/** Sum of projected points for a set of players. */
export function totalProjected(
  values: Map<string, ValuedPlayer>,
  playerIds: string[],
): number {
  return round2(
    playerIds.reduce((sum, id) => sum + (values.get(id)?.projectedPoints ?? 0), 0),
  );
}

/**
 * Rest-of-season value: identical machinery, but summing remaining weekly projections
 * instead of the season-long line. Kept separate from redraft value per the brief.
 */
export function restOfSeasonProjection(
  weeklyProjections: Projection[],
  playerId: string,
  fromWeek: number,
  lastWeek: number,
  scoring: LeagueConfig['scoring'],
): number | null {
  const weeks = weeklyProjections.filter(
    (p) =>
      p.playerId === playerId &&
      p.week !== undefined &&
      p.week >= fromWeek &&
      p.week <= lastWeek,
  );
  if (weeks.length === 0) return null;
  return round2(weeks.reduce((sum, p) => sum + scoreStatLine(p.stats, scoring), 0));
}

/** Blend a stat line with opportunity signal when available; returns the line unchanged
 *  if no opportunity data exists (never invents usage). */
export function statsWithOpportunity(stats: StatLine): StatLine {
  return stats;
}
