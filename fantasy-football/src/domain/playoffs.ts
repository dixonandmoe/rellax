import { round2 } from './scoring';
import type { FantasyTeam, LeagueConfig, Matchup, Projection } from './types';
import { scoreStatLine } from './scoring';
import type { ValuedPlayer } from './valuation';

/**
 * Playoff analysis (weeks 14-17 by default; configurable).
 *
 * Everything here depends on *weekly* projections. If weekly projections are not loaded
 * we say so rather than extrapolating the season line, because a player's playoff
 * schedule is exactly the thing a season-long average hides.
 */

export interface PlayoffPlayerOutlook {
  playerId: string;
  playerName: string;
  position: string;
  /** Sum of weekly projections across the playoff weeks. */
  playoffPoints: number | null;
  /** Playoff points per week vs. their regular-season average. */
  scheduleSwing: number | null;
  byeConflict: boolean;
  recommendation: 'BUY_BEFORE_PLAYOFFS' | 'SELL_BEFORE_PLAYOFFS' | 'HOLD';
  reason: string;
}

export interface PlayoffAnalysis {
  playoffWeeks: number[];
  dataAvailable: boolean;
  unavailableReason?: string;
  myOutlooks: PlayoffPlayerOutlook[];
  buyTargets: PlayoffPlayerOutlook[];
  sellCandidates: PlayoffPlayerOutlook[];
  teamPlayoffProjection: number | null;
  playoffScheduleDifficulty: number | null;
}

/** Weekly swing beyond this share of a player's average counts as a real schedule signal. */
export const SCHEDULE_SWING_THRESHOLD = 0.12;

export function analyzePlayoffs(
  config: LeagueConfig,
  myTeam: FantasyTeam,
  values: Map<string, ValuedPlayer>,
  weeklyProjections: Projection[],
  options: { matchups?: Matchup[]; opponentStrength?: Map<string, number> } = {},
): PlayoffAnalysis {
  const playoffWeeks = config.playoffWeeks;

  const weeklyByPlayer = new Map<string, Projection[]>();
  for (const projection of weeklyProjections) {
    if (projection.week === undefined) continue;
    const list = weeklyByPlayer.get(projection.playerId) ?? [];
    list.push(projection);
    weeklyByPlayer.set(projection.playerId, list);
  }

  if (weeklyByPlayer.size === 0) {
    return {
      playoffWeeks,
      dataAvailable: false,
      unavailableReason:
        'No weekly projections loaded. Playoff schedule analysis needs week-by-week projections — import them or connect a projection provider.',
      myOutlooks: [],
      buyTargets: [],
      sellCandidates: [],
      teamPlayoffProjection: null,
      playoffScheduleDifficulty: null,
    };
  }

  const outlooks: PlayoffPlayerOutlook[] = [];

  for (const entry of myTeam.roster) {
    const value = values.get(entry.playerId);
    if (!value) continue;
    const weeks = weeklyByPlayer.get(entry.playerId) ?? [];
    if (weeks.length === 0) continue;

    const playoffLines = weeks.filter((w) => playoffWeeks.includes(w.week!));
    const regularLines = weeks.filter(
      (w) => w.week! <= config.regularSeasonWeeks,
    );

    const playoffPoints = playoffLines.length
      ? round2(playoffLines.reduce((s, w) => s + scoreStatLine(w.stats, config.scoring), 0))
      : null;
    const playoffAvg = playoffLines.length ? playoffPoints! / playoffLines.length : null;
    const regularAvg = regularLines.length
      ? regularLines.reduce((s, w) => s + scoreStatLine(w.stats, config.scoring), 0) /
        regularLines.length
      : null;

    const swing =
      playoffAvg !== null && regularAvg !== null && regularAvg > 0
        ? round2((playoffAvg - regularAvg) / regularAvg)
        : null;

    const byeConflict =
      value.player.byeWeek !== undefined && playoffWeeks.includes(value.player.byeWeek);

    let recommendation: PlayoffPlayerOutlook['recommendation'] = 'HOLD';
    let reason = 'Playoff schedule is roughly in line with his season baseline.';

    if (byeConflict) {
      recommendation = 'SELL_BEFORE_PLAYOFFS';
      reason = `His bye (week ${value.player.byeWeek}) falls inside your playoff weeks.`;
    } else if (swing !== null && swing <= -SCHEDULE_SWING_THRESHOLD) {
      recommendation = 'SELL_BEFORE_PLAYOFFS';
      reason = `Projects ${Math.round(Math.abs(swing) * 100)}% below his season average in weeks ${playoffWeeks.join(', ')}.`;
    } else if (swing !== null && swing >= SCHEDULE_SWING_THRESHOLD) {
      recommendation = 'BUY_BEFORE_PLAYOFFS';
      reason = `Projects ${Math.round(swing * 100)}% above his season average in weeks ${playoffWeeks.join(', ')}.`;
    }

    outlooks.push({
      playerId: entry.playerId,
      playerName: value.player.name,
      position: value.player.position,
      playoffPoints,
      scheduleSwing: swing,
      byeConflict,
      recommendation,
      reason,
    });
  }

  const teamPlayoffProjection = outlooks.reduce(
    (sum, o) => sum + (o.playoffPoints ?? 0),
    0,
  );

  let difficulty: number | null = null;
  if (options.matchups && options.opponentStrength) {
    const games = options.matchups.filter(
      (m) =>
        playoffWeeks.includes(m.week) &&
        (m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id),
    );
    if (games.length > 0) {
      difficulty = round2(
        games.reduce((sum, m) => {
          const opponentId = m.homeTeamId === myTeam.id ? m.awayTeamId : m.homeTeamId;
          return sum + (options.opponentStrength!.get(opponentId) ?? 50);
        }, 0) / games.length,
      );
    }
  }

  return {
    playoffWeeks,
    dataAvailable: true,
    myOutlooks: outlooks.sort((a, b) => (b.scheduleSwing ?? 0) - (a.scheduleSwing ?? 0)),
    buyTargets: outlooks.filter((o) => o.recommendation === 'BUY_BEFORE_PLAYOFFS'),
    sellCandidates: outlooks.filter((o) => o.recommendation === 'SELL_BEFORE_PLAYOFFS'),
    teamPlayoffProjection: round2(teamPlayoffProjection),
    playoffScheduleDifficulty: difficulty,
  };
}
