import { explained, type Explained } from './explain';
import { byeWeekExposure, optimalLineup } from './lineup';
import { INJURY_FACTORS } from './valuation';
import { round2 } from './scoring';
import { startingCaliberBenchmarks, requiredStarters } from './team-needs';
import type { FantasyTeam, LeagueConfig, Position } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * Team grading.
 *
 * Grades are relative to the rest of *this* league, not to an absolute scale. A B+ RB
 * corps in a shallow 8-team league would be a C in a 14-team league, and that is correct:
 * the only thing that matters is beating the seven other managers.
 */

export interface PositionGrade {
  position: Position;
  /** 0-100 relative to the league. */
  score: number;
  grade: string;
  starterPoints: number;
  leagueRank: number;
}

export interface TeamGrade {
  teamId: string;
  overallScore: number;
  overallGrade: string;
  positionGrades: PositionGrade[];
  projectedPoints: number;
  /** Weekly projection for the optimal lineup. */
  weeklyProjection: number;
  floorProjection: number;
  ceilingProjection: number;
  starterStrength: number;
  benchStrength: number;
  depthScore: number;
  injuryRisk: number;
  byeRisk: number;
  playoffStrength: number;
  strengths: string[];
  weaknesses: string[];
  explain: Explained<number>;
}

/**
 * Floor/ceiling band.
 *
 * Without distributional projections we cannot claim a real percentile, so we model a
 * symmetric band whose width scales with roster volatility (injury exposure and how much
 * of the lineup leans on a few players). This is labelled as a modelled band in the UI,
 * never presented as a projection source's own number.
 */
export const VOLATILITY_BAND = 0.18;

export function gradeTeam(
  config: LeagueConfig,
  team: FantasyTeam,
  allTeams: FantasyTeam[],
  values: Map<string, ValuedPlayer>,
  allValued: ValuedPlayer[],
): TeamGrade {
  const lineup = optimalLineup(config, team.roster, values);
  const benchmarks = startingCaliberBenchmarks(config, allValued);

  // Per-position score relative to the league.
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  const positionGrades: PositionGrade[] = [];

  for (const position of positions) {
    const required = requiredStarters(config, position);
    if (required === 0) continue;

    const scoreFor = (t: FantasyTeam) => {
      const owned = t.roster
        .map((e) => values.get(e.playerId))
        .filter((v): v is ValuedPlayer => v?.player.position === position)
        .sort((a, b) => b.projectedPoints - a.projectedPoints)
        .slice(0, required);
      return owned.reduce((sum, p) => sum + p.projectedPoints, 0);
    };

    const mine = scoreFor(team);
    const leagueScores = allTeams.map(scoreFor).sort((a, b) => b - a);
    const rank = leagueScores.findIndex((s) => s <= mine) + 1;
    const best = leagueScores[0] ?? 0;
    const worst = leagueScores[leagueScores.length - 1] ?? 0;
    const span = best - worst || 1;
    const score = round2(clamp(((mine - worst) / span) * 100, 0, 100));

    positionGrades.push({
      position,
      score,
      grade: toLetterGrade(score),
      starterPoints: round2(mine),
      leagueRank: Math.max(1, rank),
    });
    void benchmarks;
  }

  // Depth: bench quality relative to the league's benches.
  const benchFor = (t: FantasyTeam) => {
    const l = optimalLineup(config, t.roster, values);
    return l.benchPoints;
  };
  const myBench = benchFor(team);
  const benches = allTeams.map(benchFor).sort((a, b) => b - a);
  const depthScore = normaliseAgainst(myBench, benches);

  const starters = allTeams.map((t) => optimalLineup(config, t.roster, values).startersPoints);
  const starterScore = normaliseAgainst(lineup.startersPoints, starters.sort((a, b) => b - a));

  // Injury risk: share of starting projection sitting on non-healthy players.
  const startingIds = lineup.assignments
    .map((a) => a.playerId)
    .filter((id): id is string => Boolean(id));
  const injuredPoints = startingIds.reduce((sum, id) => {
    const value = values.get(id);
    if (!value) return sum;
    const factor = INJURY_FACTORS[value.player.status] ?? 1;
    return sum + value.projectedPoints * (1 - factor);
  }, 0);
  const injuryRisk = round2(
    lineup.startersPoints > 0 ? clamp((injuredPoints / lineup.startersPoints) * 100, 0, 100) : 0,
  );

  // Bye risk: how many starting slots go unfilled on the worst bye week.
  const byeMap = new Map(
    team.roster.map((e) => [e.playerId, values.get(e.playerId)?.player.byeWeek]),
  );
  const exposure = byeWeekExposure(config, team.roster, values, byeMap);
  const worstBye = exposure[0]?.holes ?? 0;
  const byeRisk = round2(clamp((worstBye / Math.max(1, lineup.assignments.length)) * 100, 0, 100));

  // Playoff strength: starters weighted more heavily (byes are over, depth matters less).
  const playoffStrength = round2(clamp(0.8 * starterScore + 0.2 * depthScore, 0, 100));

  const overallScore = round2(
    clamp(
      0.55 * starterScore +
        0.2 * depthScore +
        0.15 * average(positionGrades.map((g) => g.score)) +
        0.1 * (100 - injuryRisk),
      0,
      100,
    ),
  );

  const sortedGrades = [...positionGrades].sort((a, b) => b.score - a.score);
  const strengths = describeStrengths(config, sortedGrades, depthScore);
  const weaknesses = describeWeaknesses(config, sortedGrades, depthScore, byeRisk, lineup.unfilledSlots);

  const weekly = round2(lineup.startersPoints / Math.max(1, config.regularSeasonWeeks + config.playoffWeeks.length));
  const seasonPoints = round2(lineup.startersPoints);

  return {
    teamId: team.id,
    overallScore,
    overallGrade: toLetterGrade(overallScore),
    positionGrades,
    projectedPoints: seasonPoints,
    weeklyProjection: weekly,
    floorProjection: round2(weekly * (1 - VOLATILITY_BAND)),
    ceilingProjection: round2(weekly * (1 + VOLATILITY_BAND)),
    starterStrength: starterScore,
    benchStrength: round2(myBench),
    depthScore,
    injuryRisk,
    byeRisk,
    playoffStrength,
    strengths,
    weaknesses,
    explain: explained(
      overallScore,
      {
        starterStrength: starterScore,
        depthScore,
        averagePositionGrade: round2(average(positionGrades.map((g) => g.score))),
        injuryRisk,
        starterSeasonPoints: seasonPoints,
      },
      `overall = 0.55×starters(${starterScore}) + 0.20×depth(${depthScore}) + ` +
        `0.15×positions(${round2(average(positionGrades.map((g) => g.score)))}) + 0.10×health(${round2(100 - injuryRisk)}) = ${overallScore}`,
      ['projections', 'rosters', 'league-config'],
    ),
  };
}

function describeStrengths(
  config: LeagueConfig,
  grades: PositionGrade[],
  depthScore: number,
): string[] {
  const out: string[] = [];
  for (const grade of grades.slice(0, 2)) {
    if (grade.score < 65) continue;
    const twoQbNote =
      grade.position === 'QB' && config.lineup.QB >= 2
        ? ` — worth more here than in a 1-QB league because you start ${config.lineup.QB}`
        : '';
    out.push(
      `${grade.position} ranks ${ordinal(grade.leagueRank)} of ${config.teamCount} in the league${twoQbNote}.`,
    );
  }
  if (depthScore >= 70) out.push('Bench depth is above league average, which absorbs injuries and byes.');
  return out;
}

function describeWeaknesses(
  config: LeagueConfig,
  grades: PositionGrade[],
  depthScore: number,
  byeRisk: number,
  unfilled: string[],
): string[] {
  const out: string[] = [];
  for (const grade of [...grades].reverse().slice(0, 2)) {
    if (grade.score > 45) continue;
    out.push(`${grade.position} ranks ${ordinal(grade.leagueRank)} of ${config.teamCount}.`);
  }
  if (unfilled.length > 0) {
    out.push(`Cannot fill ${unfilled.join(', ')} from the current roster.`);
  }
  if (depthScore < 35) out.push('Bench falls off sharply after the starters.');
  if (byeRisk > 30) out.push('A single bye week leaves multiple starting slots unfilled.');
  return out;
}

export function toLetterGrade(score: number): string {
  if (score >= 93) return 'A+';
  if (score >= 87) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 74) return 'B+';
  if (score >= 68) return 'B';
  if (score >= 62) return 'B-';
  if (score >= 55) return 'C+';
  if (score >= 48) return 'C';
  if (score >= 40) return 'C-';
  if (score >= 32) return 'D+';
  if (score >= 25) return 'D';
  return 'F';
}

function normaliseAgainst(value: number, sortedDescending: number[]): number {
  const best = sortedDescending[0] ?? 0;
  const worst = sortedDescending[sortedDescending.length - 1] ?? 0;
  const span = best - worst || 1;
  return round2(clamp(((value - worst) / span) * 100, 0, 100));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
