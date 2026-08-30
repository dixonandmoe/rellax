import { explained, type Explained } from './explain';
import { picksForSlot, picksUntilNextTurn, pickCoordinates } from './league-config';
import { marginalLineupGain, optimalLineup } from './lineup';
import {
  predictNextPick,
  survivalProbability,
  teamOnClock,
  teamsBetweenPicks,
  type NextPickPrediction,
} from './opponent-model';
import { analyzeQbScarcity, computeScarcity, type PositionScarcity, type QbScarcityReport } from './scarcity';
import { round2 } from './scoring';
import { detectSqueezes, type SqueezeAlert } from './squeeze';
import { buildTiers, tierCliff, tierRemaining, type Tier } from './tiers';
import { computeTeamNeeds, type TeamNeedsReport } from './team-needs';
import type { FantasyTeam, LeagueConfig, LeagueState, Position } from './types';
import { indexByPlayer, valuePlayers, type ValuedPlayer } from './valuation';

/**
 * The draft brain.
 *
 * The output is deliberately NOT "the highest-ranked player available". The Dynamic Draft
 * Value Score combines what a player is worth in this league, how scarce his position is,
 * how much he improves *your* lineup specifically, how likely he is to be gone before you
 * pick again, and how badly the teams picking in between want his position.
 */

/**
 * Component weights for the Dynamic Draft Value Score.
 *
 * Early rounds reward raw value (talent gaps are large and the board is unpredictable);
 * later rounds reward scarcity, roster fit and squeeze risk (talent gaps are small, so
 * *where* a player fits and whether he survives matter more than a point of projection).
 */
export interface DraftWeights {
  value: number;
  scarcity: number;
  rosterFit: number;
  urgency: number; // 1 - expected availability
  opponentDemand: number;
}

export function weightsForRound(config: LeagueConfig, round: number): DraftWeights {
  const progress = clamp(round / Math.max(1, config.draftRounds), 0, 1);
  return {
    value: lerp(0.5, 0.28, progress),
    scarcity: lerp(0.18, 0.24, progress),
    rosterFit: lerp(0.14, 0.28, progress),
    urgency: lerp(0.12, 0.14, progress),
    opponentDemand: lerp(0.06, 0.06, progress),
  };
}

export interface DraftCandidate {
  player: ValuedPlayer;
  /** 0-100 composite. */
  draftScore: number;
  /** 0-100 league-adjusted value. */
  value: number;
  /** 0-100 how much this player improves your starting lineup. */
  rosterFit: number;
  /** 0-100 positional scarcity. */
  scarcity: number;
  /** 0-1 probability the player is available at your next pick. */
  expectedAvailability: number;
  /** 0-100 how much the teams picking before you want this position. */
  opponentDemand: number;
  tier?: number;
  tierRemaining: number;
  tierCliff: number;
  marginalStarterGain: number;
  explain: Explained<number>;
}

export interface DraftRecommendation {
  onTheClock: boolean;
  overall: number;
  round: number;
  pickInRound: number;
  picksUntilNextTurn: number | null;
  nextPickOverall: number | null;
  candidates: DraftCandidate[];
  bestPick: DraftCandidate | null;
  safeAlternative: DraftCandidate | null;
  bestValue: DraftCandidate | null;
  qbScarcity: QbScarcityReport;
  squeezes: SqueezeAlert[];
  scarcity: Map<Position, PositionScarcity>;
  tiers: Map<Position, Tier[]>;
  needs: Map<string, TeamNeedsReport>;
  predictions: NextPickPrediction[];
  myNeeds: TeamNeedsReport | null;
  /** Positions with no projection data — rendered as "Data unavailable". */
  playersMissingProjections: number;
  confidence: number;
  reasoning: string[];
}

export interface DraftEngineOptions {
  /** How many candidates to return. */
  limit?: number;
  /** Override which team we are recommending for (defaults to `isMyTeam`). */
  teamId?: string;
}

export function recommendDraftPick(
  state: LeagueState,
  options: DraftEngineOptions = {},
): DraftRecommendation {
  const { config, teams, players, seasonProjections, injuries } = state;
  const limit = options.limit ?? 8;

  const myTeam =
    teams.find((t) => (options.teamId ? t.id === options.teamId : t.isMyTeam)) ?? teams[0];

  const draft = state.draft;
  const draftedIds = new Set(
    (draft?.picks ?? []).map((p) => p.playerId).filter((id): id is string => Boolean(id)),
  );
  const rosteredIds = new Set(teams.flatMap((t) => t.roster.map((r) => r.playerId)));
  const unavailable = new Set([...draftedIds, ...rosteredIds]);

  // Value the full pool once (for benchmarks) and the available pool separately (so
  // replacement level rises as the board drains).
  const fullValuation = valuePlayers(config, players, seasonProjections, { injuries });
  const availablePlayers = players.filter((p) => !unavailable.has(p.id));
  const availableValuation = valuePlayers(config, availablePlayers, seasonProjections, {
    injuries,
  });
  const available = availableValuation.players;
  const valuesById = indexByPlayer(fullValuation);

  const rosterPositions = new Map(players.map((p) => [p.id, p.position]));
  const tiers = buildTiers(available);
  const scarcity = computeScarcity(config, available, teams, rosterPositions);

  // Where are we in the draft?
  const overall = draft?.currentOverall ?? 1;
  const { round, pickInRound } = pickCoordinates(config, overall);
  const mySlot = myTeam?.draftSlot ?? config.myDraftSlot ?? 1;
  const myPicks = picksForSlot(config, mySlot);
  const onTheClock = teamOnClock(config, draft?.draftOrder ?? teams.map((t) => t.id), overall) === myTeam?.id;
  const nextPickOverall = myPicks.find((p) => p > overall) ?? null;
  const untilNext = picksUntilNextTurn(config, mySlot, overall);

  // Model every team that picks between now and my next turn.
  const needs = new Map<string, TeamNeedsReport>();
  for (const team of teams) {
    needs.set(
      team.id,
      computeTeamNeeds(config, team, valuesById, fullValuation.players),
    );
  }

  const intervening = nextPickOverall
    ? teamsBetweenPicks(config, draft?.draftOrder ?? teams.map((t) => t.id), overall, nextPickOverall)
    : [];

  const predictions: NextPickPrediction[] = [];
  for (const { teamId, overall: pickOverall } of intervening) {
    const team = teams.find((t) => t.id === teamId);
    const teamNeeds = needs.get(teamId);
    if (!team || !teamNeeds) continue;
    predictions.push(
      predictNextPick(config, team, teamNeeds, available, scarcity, pickOverall),
    );
  }

  const myNeeds = myTeam ? (needs.get(myTeam.id) ?? null) : null;
  const qbScarcity = analyzeQbScarcity(config, available, teams, rosterPositions, {
    picksUntilMyNextTurn: untilNext,
  });

  const squeezes = myNeeds
    ? detectSqueezes(config, predictions, tiers, available, myNeeds.needOrder.slice(0, 4))
    : [];

  // Score every available player.
  const weights = weightsForRound(config, round);
  const maxMarginalGain = Math.max(
    1,
    ...available.slice(0, 60).map((p) =>
      myTeam ? marginalLineupGain(config, myTeam.roster, mergeValue(valuesById, p), p) : 0,
    ),
  );

  const candidates: DraftCandidate[] = available.slice(0, 80).map((player) => {
    const positionScarcity = scarcity.get(player.player.position);
    const scarcityScore = positionScarcity?.score ?? 0;

    const marginal = myTeam
      ? marginalLineupGain(config, myTeam.roster, mergeValue(valuesById, player), player)
      : 0;
    const rosterFit = round2(clamp((marginal / maxMarginalGain) * 100, 0, 100));

    const availability = untilNext === null
      ? 1
      : survivalProbability(player, predictions, available);

    const demand = round2(
      clamp(
        predictions.reduce(
          (sum, prediction) =>
            sum +
            (prediction.distribution.find((d) => d.position === player.player.position)
              ?.probability ?? 0),
          0,
        ) * (predictions.length > 0 ? 100 / predictions.length : 0) * 2,
        0,
        100,
      ),
    );

    const urgency = (1 - availability) * 100;

    const draftScore = round2(
      weights.value * player.leagueValue +
        weights.scarcity * scarcityScore +
        weights.rosterFit * rosterFit +
        weights.urgency * urgency +
        weights.opponentDemand * demand,
    );

    return {
      player,
      draftScore,
      value: player.leagueValue,
      rosterFit,
      scarcity: scarcityScore,
      expectedAvailability: availability,
      opponentDemand: demand,
      tier: player.tier,
      tierRemaining: tierRemaining(tiers, player),
      tierCliff: round2(tierCliff(tiers, player)),
      marginalStarterGain: marginal,
      explain: explained(
        draftScore,
        {
          leagueValue: player.leagueValue,
          scarcity: scarcityScore,
          rosterFit,
          expectedAvailability: availability,
          opponentDemand: demand,
          marginalStarterGain: marginal,
          round,
        },
        `draftScore = ${weights.value}×value(${player.leagueValue}) + ${weights.scarcity}×scarcity(${scarcityScore}) + ` +
          `${weights.rosterFit}×fit(${rosterFit}) + ${weights.urgency}×urgency(${round2(urgency)}) + ` +
          `${weights.opponentDemand}×demand(${demand}) = ${draftScore}`,
        ['projections', 'rosters', 'opponent-model', 'league-config'],
      ),
    };
  });

  candidates.sort((a, b) => b.draftScore - a.draftScore);
  const top = candidates.slice(0, limit);

  const bestPick = top[0] ?? null;
  // Safe alternative: high value, high availability is irrelevant — safety means low
  // downside, i.e. a healthy player near the top of his tier with strong raw value.
  const safeAlternative =
    top
      .slice(1)
      .filter((c) => c.player.availabilityFactor >= 0.95)
      .sort((a, b) => b.value - a.value)[0] ?? null;
  // Best value: highest value per unit of urgency — the guy you could get later but is
  // priced like a bargain right now.
  const bestValue =
    [...top].sort((a, b) => b.value * b.expectedAvailability - a.value * a.expectedAvailability)[0] ??
    null;

  const reasoning = buildReasoning(
    config,
    bestPick,
    myNeeds,
    qbScarcity,
    squeezes,
    untilNext,
  );

  return {
    onTheClock,
    overall,
    round,
    pickInRound,
    picksUntilNextTurn: untilNext,
    nextPickOverall,
    candidates: top,
    bestPick,
    safeAlternative,
    bestValue,
    qbScarcity,
    squeezes,
    scarcity,
    tiers,
    needs,
    predictions,
    myNeeds,
    playersMissingProjections: availableValuation.missingProjections.length,
    confidence: computeConfidence(candidates, availableValuation.missingProjections.length, players.length),
    reasoning,
  };
}

/**
 * Confidence in the recommendation.
 *
 * High when the top candidate clearly separates from the second, and when projection
 * coverage is good. Low when the top options are within noise of each other or when a
 * large share of the pool has no projections.
 */
export function computeConfidence(
  candidates: DraftCandidate[],
  missingProjections: number,
  poolSize: number,
): number {
  if (candidates.length === 0) return 0;
  const first = candidates[0]!.draftScore;
  const second = candidates[1]?.draftScore ?? first * 0.9;
  const separation = first > 0 ? clamp((first - second) / first, 0, 0.4) / 0.4 : 0;
  const coverage = poolSize > 0 ? 1 - clamp(missingProjections / poolSize, 0, 1) : 0;
  return round2(clamp(0.45 + 0.35 * separation + 0.2 * coverage, 0, 0.99));
}

function buildReasoning(
  config: LeagueConfig,
  best: DraftCandidate | null,
  myNeeds: TeamNeedsReport | null,
  qb: QbScarcityReport,
  squeezes: SqueezeAlert[],
  untilNext: number | null,
): string[] {
  if (!best) return ['No available players with projections — connect a projection source.'];

  const reasons: string[] = [];
  const position = best.player.player.position;

  if (myNeeds && myNeeds.needOrder[0] === position) {
    reasons.push(
      `${position} is your weakest position (${Math.round((myNeeds.needByPosition[position] ?? 0) * 100)}% need).`,
    );
  }

  if (best.scarcity >= 60) {
    reasons.push(
      `${position} scarcity is ${Math.round(best.scarcity)}/100 in this ${config.teamCount}-team league.`,
    );
  }

  if (untilNext !== null && best.expectedAvailability < 0.5) {
    reasons.push(
      `Only a ${Math.round(best.expectedAvailability * 100)}% chance he survives the ${untilNext} picks before your next turn.`,
    );
  }

  if (best.tierRemaining <= 2 && best.tierCliff > 0) {
    reasons.push(
      `Just ${best.tierRemaining} player(s) left in his tier, and the drop to the next tier is ${best.tierCliff} projected points.`,
    );
  }

  const squeeze = squeezes.find((s) => s.position === position);
  if (squeeze) {
    reasons.push(
      `${squeeze.teamsNeedingPosition} teams picking before you also need ${position}.`,
    );
  }

  if (qb.isTwoQb && position === 'QB') {
    reasons.push(
      `This is a ${config.lineup.QB}-QB league: ${qb.viableStartingQbs} viable starters remain for ${qb.startingQbSlots} weekly QB slots.`,
    );
  } else if (qb.isTwoQb && qb.recommendation === 'DRAFT_QB_NOW') {
    reasons.push(
      `Note: the QB engine flags urgency — ${qb.teamsNeedingQb2} teams still need a QB${config.lineup.QB}.`,
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      `Best combination of league-adjusted value (${best.value}) and roster fit (${best.rosterFit}) on the board.`,
    );
  }

  return reasons;
}

/** Value map that definitely contains the candidate (used for marginal-gain maths). */
function mergeValue(
  values: Map<string, ValuedPlayer>,
  player: ValuedPlayer,
): Map<string, ValuedPlayer> {
  if (values.has(player.player.id)) return values;
  const copy = new Map(values);
  copy.set(player.player.id, player);
  return copy;
}

/** Snapshot of your roster's starting strength, used by the dashboard. */
export function starterStrength(
  config: LeagueConfig,
  team: FantasyTeam,
  values: Map<string, ValuedPlayer>,
): number {
  return optimalLineup(config, team.roster, values).startersPoints;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
