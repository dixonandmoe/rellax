import { explained, type Explained } from './explain';
import { pickCoordinates } from './league-config';
import { round2 } from './scoring';
import type { FantasyTeam, LeagueConfig, Position } from './types';
import type { PositionScarcity } from './scarcity';
import type { TeamNeedsReport } from './team-needs';
import type { ValuedPlayer } from './valuation';

/**
 * Opponent draft prediction.
 *
 * For each team we produce a probability distribution over which position they take with
 * their next pick, from three signals: what they need, what is scarce, and what is
 * actually available at good value. Managers are modelled as roughly-rational but
 * need-driven, which is what real drafters look like.
 */

export interface PositionProbability {
  position: Position;
  probability: number;
  /** Most likely specific targets at that position. */
  likelyTargets: string[];
}

export interface NextPickPrediction {
  teamId: string;
  overall: number;
  round: number;
  distribution: PositionProbability[];
  explain: Explained<string>;
}

export interface OpponentModelOptions {
  /** Weight on need vs. best-player-available. Rises through the draft. */
  needWeight?: number;
}

export function predictNextPick(
  config: LeagueConfig,
  team: FantasyTeam,
  needs: TeamNeedsReport,
  available: ValuedPlayer[],
  scarcity: Map<Position, PositionScarcity>,
  overall: number,
  options: OpponentModelOptions = {},
): NextPickPrediction {
  const { round } = pickCoordinates(config, overall);

  // Early rounds: managers chase value. Later rounds: managers fill holes.
  const needWeight =
    options.needWeight ?? clamp(0.3 + (round / Math.max(1, config.draftRounds)) * 0.55, 0.3, 0.85);
  const valueWeight = 1 - needWeight;

  const positions = new Set(available.map((p) => p.player.position));
  const raw: Array<{ position: Position; weight: number; targets: string[] }> = [];

  for (const position of positions) {
    const pool = available
      .filter((p) => p.player.position === position)
      .sort((a, b) => b.leagueValue - a.leagueValue);
    const best = pool[0];
    if (!best) continue;

    const need = needs.needByPosition[position] ?? 0;
    const scarcityScore = (scarcity.get(position)?.score ?? 0) / 100;
    // Value signal: how good the best available at this position is relative to the best
    // available overall.
    const bestOverall = available[0]?.leagueValue ?? 1;
    const valueSignal = bestOverall > 0 ? best.leagueValue / bestOverall : 0;

    // K and DST are essentially never taken before the last two rounds.
    const lateOnly = position === 'K' || position === 'DST';
    const roundsLeft = config.draftRounds - round;
    const positionalGate = lateOnly && roundsLeft > 2 ? 0.02 : 1;

    const weight =
      positionalGate *
      Math.max(
        0.0001,
        needWeight * (0.7 * need + 0.3 * scarcityScore) + valueWeight * valueSignal,
      );

    raw.push({ position, weight, targets: pool.slice(0, 3).map((p) => p.player.name) });
  }

  const total = raw.reduce((sum, r) => sum + r.weight, 0) || 1;
  const distribution = raw
    .map((r) => ({
      position: r.position,
      probability: round2(r.weight / total),
      likelyTargets: r.targets,
    }))
    .sort((a, b) => b.probability - a.probability);

  const top = distribution[0];

  return {
    teamId: team.id,
    overall,
    round,
    distribution,
    explain: explained(
      top ? `${top.position} ${Math.round(top.probability * 100)}%` : 'unknown',
      {
        round,
        needWeight: round2(needWeight),
        topNeed: needs.needOrder[0] ?? 'none',
        rosterSize: team.roster.length,
      },
      top
        ? `${team.name} most likely takes ${top.position} (${Math.round(top.probability * 100)}%) — ` +
          `their biggest hole is ${needs.needOrder[0] ?? 'none'} and by round ${round} managers weight need at ${Math.round(needWeight * 100)}%`
        : 'No available players to model',
      ['rosters', 'projections', 'league-config'],
    ),
  };
}

/**
 * Probability that a specific player is still available at a future pick.
 *
 * Each intervening pick is an independent draw where the team on the clock takes this
 * player with probability = P(they take this position) × P(this player is their choice
 * within the position).
 */
export function survivalProbability(
  player: ValuedPlayer,
  interveningPredictions: NextPickPrediction[],
  available: ValuedPlayer[],
): number {
  const samePosition = available
    .filter((p) => p.player.position === player.player.position)
    .sort((a, b) => b.leagueValue - a.leagueValue);
  const indexInPosition = samePosition.findIndex((p) => p.player.id === player.player.id);
  if (indexInPosition === -1) return 0;

  // Within a position, managers take roughly in value order. Model the chance this
  // specific player is the one chosen as geometric in their position rank.
  const withinPositionShare = Math.pow(0.55, indexInPosition) * 0.55 + 0.05;

  let survival = 1;
  for (const prediction of interveningPredictions) {
    const positionProbability =
      prediction.distribution.find((d) => d.position === player.player.position)
        ?.probability ?? 0;
    const takeProbability = clamp(positionProbability * withinPositionShare, 0, 0.95);
    survival *= 1 - takeProbability;
  }

  return round2(clamp(survival, 0, 1));
}

/** Teams picking between two overall pick numbers, in order. */
export function teamsBetweenPicks(
  config: LeagueConfig,
  draftOrder: string[],
  fromOverall: number,
  toOverall: number,
): Array<{ teamId: string; overall: number }> {
  const result: Array<{ teamId: string; overall: number }> = [];
  for (let overall = fromOverall + 1; overall < toOverall; overall++) {
    const teamId = teamOnClock(config, draftOrder, overall);
    if (teamId) result.push({ teamId, overall });
  }
  return result;
}

/** Which team owns a given overall pick, honouring snake vs. linear order. */
export function teamOnClock(
  config: LeagueConfig,
  draftOrder: string[],
  overall: number,
): string | undefined {
  if (draftOrder.length === 0) return undefined;
  const { round, pickInRound } = pickCoordinates(config, overall);
  const reversed = config.draftType === 'SNAKE' && round % 2 === 0;
  const index = reversed ? draftOrder.length - pickInRound : pickInRound - 1;
  return draftOrder[index];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
