import { explained, type Explained } from './explain';
import { round2 } from './scoring';
import { gradeTeam, type TeamGrade } from './team-grade';
import type { FantasyTeam, LeagueConfig, Matchup } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * League power rankings.
 *
 * Explicitly NOT record-based. Record in an 8-team league over 13 games is mostly noise;
 * roster strength, positional advantage and schedule are the signal. Record enters only
 * as a small term, because it does carry *some* information about lineup management.
 */

export interface PowerRanking {
  rank: number;
  teamId: string;
  teamName: string;
  score: number;
  grade: TeamGrade;
  /** Points of remaining schedule difficulty; higher = harder. */
  scheduleDifficulty: number | null;
  playoffScheduleDifficulty: number | null;
  record: string;
  explanation: string;
  explain: Explained<number>;
}

export interface PowerRankingOptions {
  currentWeek?: number;
  matchups?: Matchup[];
}

export function computePowerRankings(
  config: LeagueConfig,
  teams: FantasyTeam[],
  values: Map<string, ValuedPlayer>,
  allValued: ValuedPlayer[],
  options: PowerRankingOptions = {},
): PowerRanking[] {
  const { currentWeek = 0, matchups = [] } = options;

  const grades = new Map<string, TeamGrade>();
  for (const team of teams) {
    grades.set(team.id, gradeTeam(config, team, teams, values, allValued));
  }

  // Schedule difficulty: average opponent starter strength over remaining games.
  const strengthByTeam = new Map(
    [...grades].map(([teamId, grade]) => [teamId, grade.starterStrength]),
  );

  const scheduleDifficulty = (teamId: string, weeks: (week: number) => boolean) => {
    const relevant = matchups.filter(
      (m) => weeks(m.week) && (m.homeTeamId === teamId || m.awayTeamId === teamId),
    );
    if (relevant.length === 0) return null;
    const opponents = relevant.map((m) =>
      m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId,
    );
    const total = opponents.reduce((sum, id) => sum + (strengthByTeam.get(id) ?? 50), 0);
    return round2(total / opponents.length);
  };

  const entries = teams.map((team) => {
    const grade = grades.get(team.id)!;
    const remaining = scheduleDifficulty(team.id, (w) => w > currentWeek && w <= config.regularSeasonWeeks);
    const playoff = scheduleDifficulty(team.id, (w) => config.playoffWeeks.includes(w));

    const gamesPlayed = team.wins + team.losses + team.ties;
    const winRate = gamesPlayed > 0 ? (team.wins + team.ties * 0.5) / gamesPlayed : 0.5;

    // Schedule bonus: an easier remaining schedule is worth real points.
    const scheduleAdjustment = remaining === null ? 0 : (50 - remaining) * 0.12;

    const score = round2(
      clamp(
        0.50 * grade.starterStrength +
          0.15 * grade.depthScore +
          0.12 * average(grade.positionGrades.map((g) => g.score)) +
          0.08 * grade.playoffStrength +
          0.07 * (100 - grade.injuryRisk) +
          0.08 * (winRate * 100) +
          scheduleAdjustment,
        0,
        100,
      ),
    );

    return { team, grade, score, remaining, playoff, winRate };
  });

  entries.sort((a, b) => b.score - a.score);

  return entries.map((entry, index) => {
    const strongest = [...entry.grade.positionGrades].sort((a, b) => b.score - a.score)[0];
    const weakest = [...entry.grade.positionGrades].sort((a, b) => a.score - b.score)[0];

    const explanation =
      `Starting lineup rates ${Math.round(entry.grade.starterStrength)}/100 league-relative` +
      (strongest ? `, carried by ${strongest.position}` : '') +
      (weakest ? `, dragged by ${weakest.position}` : '') +
      `. Bench depth ${Math.round(entry.grade.depthScore)}/100` +
      (entry.remaining !== null
        ? `; remaining schedule difficulty ${entry.remaining}/100`
        : '; schedule not loaded') +
      `.`;

    return {
      rank: index + 1,
      teamId: entry.team.id,
      teamName: entry.team.name,
      score: entry.score,
      grade: entry.grade,
      scheduleDifficulty: entry.remaining,
      playoffScheduleDifficulty: entry.playoff,
      record: `${entry.team.wins}-${entry.team.losses}${entry.team.ties ? `-${entry.team.ties}` : ''}`,
      explanation,
      explain: explained(
        entry.score,
        {
          starterStrength: entry.grade.starterStrength,
          depthScore: entry.grade.depthScore,
          playoffStrength: entry.grade.playoffStrength,
          injuryRisk: entry.grade.injuryRisk,
          winRate: round2(entry.winRate),
          remainingScheduleDifficulty: entry.remaining ?? -1,
        },
        `power = 0.50×starters + 0.15×depth + 0.12×positions + 0.08×playoffStrength + ` +
          `0.07×health + 0.08×winRate + scheduleAdjustment = ${entry.score}`,
        ['projections', 'rosters', 'schedule', 'league-config'],
      ),
    };
  });
}

/**
 * Projected regular-season finish and championship odds.
 *
 * A light Monte Carlo over remaining matchups using each team's weekly projection and a
 * modelled standard deviation. This is a model output, labelled as such — not a
 * projection any data provider supplied.
 */
export interface SeasonSimulation {
  teamId: string;
  projectedWins: number;
  projectedFinish: number;
  playoffOdds: number;
  championshipOdds: number;
}

export const WEEKLY_STDEV_RATIO = 0.22;

export function simulateSeason(
  config: LeagueConfig,
  teams: FantasyTeam[],
  weeklyProjectionByTeam: Map<string, number>,
  matchups: Matchup[],
  options: { iterations?: number; currentWeek?: number; seed?: number } = {},
): SeasonSimulation[] {
  const { iterations = 2000, currentWeek = 0 } = options;
  const random = mulberry32(options.seed ?? 20260830);

  const wins = new Map<string, number>(teams.map((t) => [t.id, 0]));
  const finishes = new Map<string, number[]>(teams.map((t) => [t.id, []]));
  const playoffs = new Map<string, number>(teams.map((t) => [t.id, 0]));
  const titles = new Map<string, number>(teams.map((t) => [t.id, 0]));

  const remaining = matchups.filter(
    (m) => m.week > currentWeek && m.week <= config.regularSeasonWeeks,
  );

  for (let i = 0; i < iterations; i++) {
    const seasonWins = new Map<string, number>(
      teams.map((t) => [t.id, t.wins + t.ties * 0.5]),
    );
    const seasonPoints = new Map<string, number>(teams.map((t) => [t.id, t.pointsFor]));

    for (const matchup of remaining) {
      const home = sampleScore(weeklyProjectionByTeam.get(matchup.homeTeamId) ?? 0, random);
      const away = sampleScore(weeklyProjectionByTeam.get(matchup.awayTeamId) ?? 0, random);
      seasonPoints.set(matchup.homeTeamId, (seasonPoints.get(matchup.homeTeamId) ?? 0) + home);
      seasonPoints.set(matchup.awayTeamId, (seasonPoints.get(matchup.awayTeamId) ?? 0) + away);
      const winner = home >= away ? matchup.homeTeamId : matchup.awayTeamId;
      seasonWins.set(winner, (seasonWins.get(winner) ?? 0) + 1);
    }

    const standings = [...teams]
      .map((t) => ({
        id: t.id,
        w: seasonWins.get(t.id) ?? 0,
        pf: seasonPoints.get(t.id) ?? 0,
      }))
      .sort((a, b) => b.w - a.w || b.pf - a.pf);

    standings.forEach((entry, index) => {
      wins.set(entry.id, (wins.get(entry.id) ?? 0) + entry.w);
      finishes.get(entry.id)!.push(index + 1);
      if (index < config.playoffTeams) {
        playoffs.set(entry.id, (playoffs.get(entry.id) ?? 0) + 1);
      }
    });

    // Playoff bracket: single-elimination by seed, decided by sampled scores.
    let bracket = standings.slice(0, config.playoffTeams).map((s) => s.id);
    while (bracket.length > 1) {
      const next: string[] = [];
      for (let j = 0; j < bracket.length / 2; j++) {
        const a = bracket[j]!;
        const b = bracket[bracket.length - 1 - j]!;
        const scoreA = sampleScore(weeklyProjectionByTeam.get(a) ?? 0, random);
        const scoreB = sampleScore(weeklyProjectionByTeam.get(b) ?? 0, random);
        next.push(scoreA >= scoreB ? a : b);
      }
      bracket = next;
    }
    if (bracket[0]) titles.set(bracket[0], (titles.get(bracket[0]) ?? 0) + 1);
  }

  return teams.map((team) => {
    const finishList = finishes.get(team.id) ?? [];
    return {
      teamId: team.id,
      projectedWins: round2((wins.get(team.id) ?? 0) / iterations),
      projectedFinish: Math.round(
        finishList.reduce((a, b) => a + b, 0) / Math.max(1, finishList.length),
      ),
      playoffOdds: round2((playoffs.get(team.id) ?? 0) / iterations),
      championshipOdds: round2((titles.get(team.id) ?? 0) / iterations),
    };
  });
}

function sampleScore(mean: number, random: () => number): number {
  const stdev = mean * WEEKLY_STDEV_RATIO;
  // Box-Muller
  const u1 = Math.max(1e-9, random());
  const u2 = random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, mean + z * stdev);
}

/** Deterministic PRNG so simulations are reproducible (and testable). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
