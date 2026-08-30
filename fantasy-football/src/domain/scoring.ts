import { explained, type Explained } from './explain';
import type { Position, ScoringRules, StatLine } from './types';

/**
 * Fantasy points from a raw stat line under a specific league's scoring rules.
 *
 * Providers hand us stat lines, never points. Everything downstream — valuation,
 * lineups, trades, FAAB — reads points from here so that changing league scoring changes
 * every number in the app consistently.
 */
export function scoreStatLine(stats: StatLine, rules: ScoringRules): number {
  let points = 0;

  // Passing
  points += div(stats.passYards, rules.passYardsPerPoint);
  points += (stats.passTd ?? 0) * rules.passTdPoints;
  points += (stats.interceptions ?? 0) * rules.passIntPoints;
  points += (stats.passTwoPt ?? 0) * rules.passTwoPtPoints;

  // Rushing
  points += div(stats.rushYards, rules.rushYardsPerPoint);
  points += (stats.rushTd ?? 0) * rules.rushTdPoints;
  points += (stats.rushTwoPt ?? 0) * rules.twoPtPoints;

  // Receiving
  points += (stats.receptions ?? 0) * rules.receptionPoints;
  points += div(stats.recYards, rules.recYardsPerPoint);
  points += (stats.recTd ?? 0) * rules.recTdPoints;
  points += (stats.recTwoPt ?? 0) * rules.twoPtPoints;

  // Turnovers
  points += (stats.fumblesLost ?? 0) * rules.fumbleLostPoints;

  // Kicking
  points += (stats.fgMade0to39 ?? 0) * rules.fg0to39Points;
  points += (stats.fgMade40to49 ?? 0) * rules.fg40to49Points;
  points += (stats.fgMade50Plus ?? 0) * rules.fg50PlusPoints;
  points += (stats.fgMissed ?? 0) * rules.fgMissPoints;
  points += (stats.patMade ?? 0) * rules.patPoints;
  points += (stats.patMissed ?? 0) * rules.patMissPoints;

  // Defense / special teams
  points += (stats.sacks ?? 0) * rules.sackPoints;
  points += (stats.defInterceptions ?? 0) * rules.defIntPoints;
  points += (stats.fumbleRecoveries ?? 0) * rules.fumbleRecoveryPoints;
  points += (stats.defTd ?? 0) * rules.defTdPoints;
  points += (stats.safeties ?? 0) * rules.safetyPoints;
  if (stats.pointsAllowed !== undefined) {
    points += pointsAllowedScore(stats.pointsAllowed, rules);
  }

  return round2(points);
}

/** Same calculation, with its derivation attached. */
export function scoreStatLineExplained(
  stats: StatLine,
  rules: ScoringRules,
  source: string,
): Explained<number> {
  const value = scoreStatLine(stats, rules);
  const parts: string[] = [];
  const inputs: Record<string, number> = {};

  const add = (label: string, raw: number | undefined, contribution: number) => {
    if (raw === undefined || raw === 0) return;
    inputs[label] = raw;
    parts.push(`${label}(${raw})→${round2(contribution)}`);
  };

  add('passYards', stats.passYards, div(stats.passYards, rules.passYardsPerPoint));
  add('passTd', stats.passTd, (stats.passTd ?? 0) * rules.passTdPoints);
  add('interceptions', stats.interceptions, (stats.interceptions ?? 0) * rules.passIntPoints);
  add('rushYards', stats.rushYards, div(stats.rushYards, rules.rushYardsPerPoint));
  add('rushTd', stats.rushTd, (stats.rushTd ?? 0) * rules.rushTdPoints);
  add('receptions', stats.receptions, (stats.receptions ?? 0) * rules.receptionPoints);
  add('recYards', stats.recYards, div(stats.recYards, rules.recYardsPerPoint));
  add('recTd', stats.recTd, (stats.recTd ?? 0) * rules.recTdPoints);
  add('fumblesLost', stats.fumblesLost, (stats.fumblesLost ?? 0) * rules.fumbleLostPoints);

  return explained(
    value,
    inputs,
    parts.length > 0 ? `${parts.join(' + ')} = ${value}` : `no scoring stats → ${value}`,
    [source],
  );
}

export function pointsAllowedScore(pointsAllowed: number, rules: ScoringRules): number {
  for (const tier of rules.pointsAllowedTiers) {
    if (pointsAllowed <= tier.max) return tier.points;
  }
  return 0;
}

/**
 * Positions whose scoring is materially affected by the reception setting. Used by the
 * UI to explain why a 0.5-PPR league values pass-catching backs the way it does.
 */
export function pprSensitivePositions(rules: ScoringRules): Position[] {
  return rules.receptionPoints > 0 ? ['RB', 'WR', 'TE'] : [];
}

function div(value: number | undefined, per: number): number {
  if (!value || !per) return 0;
  return value / per;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
