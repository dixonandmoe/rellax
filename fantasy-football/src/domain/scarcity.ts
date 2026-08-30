import { explained, type Explained } from './explain';
import { isTwoQbLeague, leagueQbDemand, leagueStartingSlots } from './league-config';
import { replacementRank } from './replacement';
import { round2 } from './scoring';
import type { FantasyTeam, LeagueConfig, Position } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * Positional scarcity.
 *
 * Scarcity is not "how few players are left" — it is "how fast does quality fall off
 * relative to how many teams still need one". A position with 40 remaining players but a
 * cliff after the next 2 is scarcer than a position with 12 remaining and a flat curve.
 */

export interface PositionScarcity {
  position: Position;
  /** Players remaining who project above replacement level. */
  viableRemaining: number;
  /** League-wide starting slots for this position. */
  startingSlots: number;
  /** Unfilled starting slots across all teams right now. */
  openStartingSlots: number;
  /** Teams that still need at least one starter here. */
  teamsNeeding: number;
  /** Points lost moving from the best available to the replacement-level player. */
  dropToReplacement: number;
  /** Average per-player quality decay over the next few picks at this position. */
  decayRate: number;
  /** 0-100 composite. Higher = act sooner. */
  score: number;
  explain: Explained<number>;
}

export function computeScarcity(
  config: LeagueConfig,
  available: ValuedPlayer[],
  teams: FantasyTeam[],
  rosterPositions: Map<string, Position>,
): Map<Position, PositionScarcity> {
  const result = new Map<Position, PositionScarcity>();
  const positions = new Set(available.map((p) => p.player.position));

  for (const position of positions) {
    const pool = available
      .filter((p) => p.player.position === position)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);

    const rank = replacementRank(config, position);
    const replacementPoints =
      pool[Math.min(rank, pool.length) - 1]?.projectedPoints ??
      pool[pool.length - 1]?.projectedPoints ??
      0;

    const viableRemaining = pool.filter((p) => p.projectedPoints > replacementPoints).length;
    const startingSlots = leagueStartingSlots(config, position);

    // How many starting slots are still unfilled across the league.
    let filled = 0;
    const needingTeams = new Set<string>();
    for (const team of teams) {
      const count = team.roster.filter(
        (entry) => rosterPositions.get(entry.playerId) === position,
      ).length;
      const required = config.lineup[position as keyof typeof config.lineup] ?? 0;
      filled += Math.min(count, required);
      if (count < required) needingTeams.add(team.id);
    }
    const openStartingSlots = Math.max(0, startingSlots - filled);

    const best = pool[0]?.projectedPoints ?? 0;
    const dropToReplacement = round2(best - replacementPoints);

    // Decay over the next `teamCount` players at this position — the realistic horizon
    // between one manager's picks.
    const horizon = Math.min(config.teamCount, Math.max(1, pool.length - 1));
    const decayRate = round2((best - (pool[horizon]?.projectedPoints ?? replacementPoints)) / horizon);

    const score = scarcityScore({
      viableRemaining,
      openStartingSlots,
      teamsNeeding: needingTeams.size,
      teamCount: config.teamCount,
      dropToReplacement,
      decayRate,
    });

    result.set(position, {
      position,
      viableRemaining,
      startingSlots,
      openStartingSlots,
      teamsNeeding: needingTeams.size,
      dropToReplacement,
      decayRate,
      score,
      explain: explained(
        score,
        {
          viableRemaining,
          startingSlots,
          openStartingSlots,
          teamsNeeding: needingTeams.size,
          dropToReplacement,
          decayRate,
        },
        `${viableRemaining} viable ${position}s remain for ${openStartingSlots} open starting slots ` +
          `(${needingTeams.size}/${teams.length} teams still need one); quality falls ${decayRate} pts per pick at this position`,
        ['projections', 'rosters', 'league-config'],
      ),
    });
  }

  return result;
}

/**
 * Composite scarcity score.
 *
 * Supply/demand ratio dominates; the quality cliff modulates it. Both are needed: a
 * position can be short on bodies but flat in value (waiting is fine), or deep in bodies
 * with a cliff at the top (waiting is not fine).
 */
export function scarcityScore(input: {
  viableRemaining: number;
  openStartingSlots: number;
  teamsNeeding: number;
  teamCount: number;
  dropToReplacement: number;
  decayRate: number;
}): number {
  const { viableRemaining, openStartingSlots, teamsNeeding, teamCount, decayRate } = input;

  // Supply pressure: 1 when there is exactly one viable player per open slot or fewer.
  const supplyRatio = openStartingSlots === 0 ? 0 : viableRemaining / openStartingSlots;
  const supplyPressure = clamp01(1.6 - supplyRatio * 0.6);

  // Demand breadth: what share of the league is shopping for this position.
  const demandBreadth = teamCount === 0 ? 0 : clamp01(teamsNeeding / teamCount);

  // Cliff steepness, normalised: 3+ points lost per pick is a steep cliff.
  const cliff = clamp01(decayRate / 3);

  const score = 100 * (0.45 * supplyPressure + 0.3 * demandBreadth + 0.25 * cliff);
  return round2(clamp(score, 0, 100));
}

// ---------------------------------------------------------------------------
// 2-QB / superflex scarcity engine
// ---------------------------------------------------------------------------

export interface QbScarcityReport {
  isTwoQb: boolean;
  /** Starting QB slots across the league each week. */
  startingQbSlots: number;
  viableStartingQbs: number;
  replacementRank: number;
  replacementPoints: number;
  eliteVsReplacementGap: number;
  teamsNeedingQb1: number;
  teamsNeedingQb2: number;
  expectedQbsTakenBeforeMyNextPick: number | null;
  /** Probability the Nth-best remaining QB survives to my next pick. */
  survivalOfNextTierQb: number | null;
  recommendation: 'DRAFT_QB_NOW' | 'QB_SOON' | 'QB_CAN_WAIT';
  explain: Explained<string>;
}

export function analyzeQbScarcity(
  config: LeagueConfig,
  available: ValuedPlayer[],
  teams: FantasyTeam[],
  rosterPositions: Map<string, Position>,
  options: { picksUntilMyNextTurn?: number | null } = {},
): QbScarcityReport {
  const twoQb = isTwoQbLeague(config);
  const qbs = available
    .filter((p) => p.player.position === 'QB')
    .sort((a, b) => b.projectedPoints - a.projectedPoints);

  const rank = replacementRank(config, 'QB');
  const replacementPoints =
    qbs[Math.min(rank, qbs.length) - 1]?.projectedPoints ??
    qbs[qbs.length - 1]?.projectedPoints ??
    0;
  const viable = qbs.filter((p) => p.projectedPoints > replacementPoints).length;

  const required = config.lineup.QB;
  let needingQb1 = 0;
  let needingQb2 = 0;
  for (const team of teams) {
    const count = team.roster.filter((e) => rosterPositions.get(e.playerId) === 'QB').length;
    if (count < 1) needingQb1++;
    if (count < required) needingQb2++;
  }

  const elite = qbs[0]?.projectedPoints ?? 0;
  const gap = round2(elite - replacementPoints);

  const picksUntilNext = options.picksUntilMyNextTurn ?? null;

  // Expected QBs taken before my next pick: each intervening pick is made by a team that
  // needs a QB with probability (teamsNeeding / teams), and such a team takes a QB at a
  // rate driven by how scarce QBs are relative to their other holes.
  let expectedTaken: number | null = null;
  let survival: number | null = null;
  if (picksUntilNext !== null && teams.length > 0) {
    const needShare = needingQb2 / teams.length;
    // In a 2-QB league a needy team takes a QB roughly every other pick; in a 1-QB league
    // far less often. This rate is the model's key assumption and is tested.
    const takeRate = twoQb ? 0.5 : 0.18;
    const perPickProbability = clamp01(needShare * takeRate);
    expectedTaken = round2(picksUntilNext * perPickProbability);
    // Probability the next QB off my board survives: nobody takes a QB in the window.
    survival = round2(Math.pow(1 - perPickProbability, picksUntilNext));
  }

  let recommendation: QbScarcityReport['recommendation'] = 'QB_CAN_WAIT';
  if (twoQb) {
    if (survival !== null && survival < 0.35 && gap > 25) recommendation = 'DRAFT_QB_NOW';
    else if (viable <= needingQb2 + 2 || (survival !== null && survival < 0.6))
      recommendation = 'QB_SOON';
  } else if (viable <= needingQb1) {
    recommendation = 'QB_SOON';
  }

  const summary =
    `${viable} viable starting QBs remain against ${leagueQbDemand(config)} weekly QB slots; ` +
    `${needingQb2} teams still need a QB${required > 1 ? required : ''}` +
    (picksUntilNext !== null ? `; you pick again in ${picksUntilNext} selections` : '');

  return {
    isTwoQb: twoQb,
    startingQbSlots: leagueStartingSlots(config, 'QB'),
    viableStartingQbs: viable,
    replacementRank: rank,
    replacementPoints: round2(replacementPoints),
    eliteVsReplacementGap: gap,
    teamsNeedingQb1: needingQb1,
    teamsNeedingQb2: needingQb2,
    expectedQbsTakenBeforeMyNextPick: expectedTaken,
    survivalOfNextTierQb: survival,
    recommendation,
    explain: explained(
      recommendation,
      {
        isTwoQb: twoQb,
        startingQbSlots: leagueStartingSlots(config, 'QB'),
        viableStartingQbs: viable,
        replacementRank: rank,
        eliteVsReplacementGap: gap,
        teamsNeedingQb2: needingQb2,
        picksUntilMyNextTurn: picksUntilNext ?? -1,
        survivalProbability: survival ?? -1,
      },
      summary,
      ['projections', 'rosters', 'league-config'],
    ),
  };
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
