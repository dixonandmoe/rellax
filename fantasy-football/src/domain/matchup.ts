import { explained, type Explained } from './explain';
import { optimalLineup, type OptimalLineup } from './lineup';
import { WEEKLY_STDEV_RATIO } from './power-rankings';
import { round2 } from './scoring';
import type { FantasyTeam, LeagueConfig, Position } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * Weekly matchup analysis.
 *
 * Win probability comes from treating each team's weekly score as normal around its
 * projection. That is a model, not a projection source's number, and is labelled as such.
 */

export interface PositionEdge {
  position: Position;
  myPoints: number;
  opponentPoints: number;
  edge: number;
}

export interface MatchupAnalysis {
  week: number;
  myTeamId: string;
  opponentTeamId: string;
  myProjection: number;
  opponentProjection: number;
  winProbability: number;
  edges: PositionEdge[];
  biggestAdvantage: PositionEdge | null;
  biggestDisadvantage: PositionEdge | null;
  keyPlayerIds: string[];
  /** Players whose outcome swings the matchup most. */
  volatilePlayerIds: string[];
  myLineup: OptimalLineup;
  explain: Explained<number>;
}

export function analyzeMatchup(
  config: LeagueConfig,
  week: number,
  myTeam: FantasyTeam,
  opponent: FantasyTeam,
  values: Map<string, ValuedPlayer>,
): MatchupAnalysis {
  const mine = optimalLineup(config, myTeam.roster, values);
  const theirs = optimalLineup(config, opponent.roster, values);

  const weeks = Math.max(1, config.regularSeasonWeeks + config.playoffWeeks.length);
  const myProjection = round2(mine.startersPoints / weeks);
  const opponentProjection = round2(theirs.startersPoints / weeks);

  const winProbability = normalWinProbability(myProjection, opponentProjection);

  const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  const edges: PositionEdge[] = positions
    .map((position) => {
      const my = sumStartersAt(mine, values, position) / weeks;
      const opp = sumStartersAt(theirs, values, position) / weeks;
      return {
        position,
        myPoints: round2(my),
        opponentPoints: round2(opp),
        edge: round2(my - opp),
      };
    })
    .filter((e) => e.myPoints > 0 || e.opponentPoints > 0);

  const sorted = [...edges].sort((a, b) => b.edge - a.edge);

  const starters = mine.assignments
    .map((a) => a.playerId)
    .filter((id): id is string => Boolean(id))
    .map((id) => values.get(id))
    .filter((v): v is ValuedPlayer => Boolean(v))
    .sort((a, b) => b.projectedPoints - a.projectedPoints);

  return {
    week,
    myTeamId: myTeam.id,
    opponentTeamId: opponent.id,
    myProjection,
    opponentProjection,
    winProbability,
    edges,
    biggestAdvantage: sorted[0] ?? null,
    biggestDisadvantage: sorted[sorted.length - 1] ?? null,
    keyPlayerIds: starters.slice(0, 3).map((p) => p.player.id),
    volatilePlayerIds: starters
      .filter((p) => p.availabilityFactor < 1 || p.player.position === 'TE')
      .slice(0, 3)
      .map((p) => p.player.id),
    myLineup: mine,
    explain: explained(
      winProbability,
      {
        myProjection,
        opponentProjection,
        margin: round2(myProjection - opponentProjection),
        weeklyStdevRatio: WEEKLY_STDEV_RATIO,
      },
      `Win probability from a normal model: margin ${round2(myProjection - opponentProjection)} pts, ` +
        `combined weekly σ ≈ ${round2(combinedStdev(myProjection, opponentProjection))} → ${Math.round(winProbability * 100)}%`,
      ['projections', 'rosters', 'model:normal-approximation'],
    ),
  };
}

export function normalWinProbability(myProjection: number, opponentProjection: number): number {
  const sigma = combinedStdev(myProjection, opponentProjection);
  if (sigma === 0) return myProjection >= opponentProjection ? 1 : 0;
  const z = (myProjection - opponentProjection) / sigma;
  return round2(clamp(normalCdf(z), 0, 1));
}

function combinedStdev(a: number, b: number): number {
  const sa = a * WEEKLY_STDEV_RATIO;
  const sb = b * WEEKLY_STDEV_RATIO;
  return Math.sqrt(sa * sa + sb * sb);
}

/** Abramowitz & Stegun 7.1.26 approximation of the standard normal CDF. */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function sumStartersAt(
  lineup: OptimalLineup,
  values: Map<string, ValuedPlayer>,
  position: Position,
): number {
  return lineup.assignments.reduce((sum, assignment) => {
    if (!assignment.playerId) return sum;
    const value = values.get(assignment.playerId);
    if (value?.player.position !== position) return sum;
    return sum + value.projectedPoints;
  }, 0);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
