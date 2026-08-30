import {
  FLEX_POSITIONS,
  SUPERFLEX_POSITIONS,
  type LeagueConfig,
  type LineupRequirements,
  type Position,
  type ScoringRules,
} from './types';

/**
 * Scoring defaults matching the target league: 0.5 PPR.
 * These are defaults for *seeding a new league*, not constants used by the engines —
 * engines always read `LeagueConfig`.
 */
export const DEFAULT_SCORING: ScoringRules = {
  passYardsPerPoint: 25,
  passTdPoints: 4,
  passIntPoints: -2,
  passTwoPtPoints: 2,
  rushYardsPerPoint: 10,
  rushTdPoints: 6,
  recYardsPerPoint: 10,
  recTdPoints: 6,
  receptionPoints: 0.5,
  twoPtPoints: 2,
  fumbleLostPoints: -2,
  fg0to39Points: 3,
  fg40to49Points: 4,
  fg50PlusPoints: 5,
  fgMissPoints: -1,
  patPoints: 1,
  patMissPoints: -1,
  sackPoints: 1,
  defIntPoints: 2,
  fumbleRecoveryPoints: 2,
  defTdPoints: 6,
  safetyPoints: 2,
  pointsAllowedTiers: [
    { max: 0, points: 10 },
    { max: 6, points: 7 },
    { max: 13, points: 4 },
    { max: 17, points: 1 },
    { max: 27, points: 0 },
    { max: 34, points: -1 },
    { max: 45, points: -3 },
    { max: Infinity, points: -5 },
  ],
};

/** Target league: 8 teams, 2 QB, 0.5 PPR, FAAB. */
export const DEFAULT_LINEUP: LineupRequirements = {
  QB: 2,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  SUPERFLEX: 0,
  K: 1,
  DST: 1,
  BENCH: 6,
  IR: 1,
};

export const DEFAULT_LEAGUE_CONFIG: LeagueConfig = {
  id: 'default',
  name: 'My League',
  season: new Date().getFullYear(),
  teamCount: 8,
  scoring: DEFAULT_SCORING,
  lineup: DEFAULT_LINEUP,
  flexEligibility: FLEX_POSITIONS,
  superflexEligibility: SUPERFLEX_POSITIONS,
  waiverType: 'FAAB',
  faabBudget: 100,
  draftType: 'SNAKE',
  draftRounds: 16,
  regularSeasonWeeks: 13,
  playoffWeeks: [14, 15, 16, 17],
  playoffTeams: 4,
  dynastyEnabled: false,
  seasonMode: 'PREDRAFT',
};

// ---------------------------------------------------------------------------
// Derived league facts — the numbers the scarcity model depends on.
// ---------------------------------------------------------------------------

/** Total dedicated starting slots for a position across the whole league. */
export function leagueStartingSlots(config: LeagueConfig, position: Position): number {
  const dedicated = config.lineup[position as keyof LineupRequirements] ?? 0;
  return dedicated * config.teamCount;
}

/**
 * Share of FLEX/SUPERFLEX slots a position can expect to occupy.
 *
 * Flex slots do not split evenly across eligible positions: RBs and WRs fill the great
 * majority of RB/WR/TE flexes. Rather than assume an even split we weight by how many
 * startable players each position produces relative to its dedicated slots.
 */
export function flexShare(config: LeagueConfig, position: Position): number {
  let share = 0;

  if (config.lineup.FLEX > 0 && config.flexEligibility.includes(position)) {
    const weights = FLEX_OCCUPANCY_WEIGHTS;
    const total = config.flexEligibility.reduce((sum, p) => sum + (weights[p] ?? 0), 0);
    if (total > 0) {
      share += config.lineup.FLEX * config.teamCount * ((weights[position] ?? 0) / total);
    }
  }

  if (config.lineup.SUPERFLEX > 0 && config.superflexEligibility.includes(position)) {
    // In a superflex league the slot is a QB slot in practice.
    const isQb = position === 'QB';
    share += config.lineup.SUPERFLEX * config.teamCount * (isQb ? 0.85 : 0.05);
  }

  return share;
}

/**
 * Empirical flex occupancy weights. Derived from how flex slots are actually filled in
 * standard leagues (RB and WR dominate; TE rarely flexes outside elite tiers).
 * Exposed as a named constant so it can be tuned in one place and is visible in tests.
 */
export const FLEX_OCCUPANCY_WEIGHTS: Partial<Record<Position, number>> = {
  RB: 0.45,
  WR: 0.45,
  TE: 0.1,
  QB: 0,
  K: 0,
  DST: 0,
};

/** Roster spots per team, excluding IR. */
export function rosterSize(config: LeagueConfig): number {
  const l = config.lineup;
  return l.QB + l.RB + l.WR + l.TE + l.FLEX + l.SUPERFLEX + l.K + l.DST + l.BENCH;
}

/** Total starting slots per team across all positions. */
export function startersPerTeam(config: LeagueConfig): number {
  const l = config.lineup;
  return l.QB + l.RB + l.WR + l.TE + l.FLEX + l.SUPERFLEX + l.K + l.DST;
}

/** Is this a 2-QB / superflex league? Drives the dedicated QB scarcity model. */
export function isTwoQbLeague(config: LeagueConfig): boolean {
  return config.lineup.QB >= 2 || config.lineup.SUPERFLEX > 0;
}

/** Expected number of QBs started league-wide each week. */
export function leagueQbDemand(config: LeagueConfig): number {
  return leagueStartingSlots(config, 'QB') + flexShare(config, 'QB');
}

/**
 * Convert an overall pick number to (round, pickInRound) honouring draft type.
 * Overall is 1-indexed.
 */
export function pickCoordinates(
  config: LeagueConfig,
  overall: number,
): { round: number; pickInRound: number } {
  const round = Math.floor((overall - 1) / config.teamCount) + 1;
  const pickInRound = ((overall - 1) % config.teamCount) + 1;
  return { round, pickInRound };
}

/** The overall pick numbers belonging to a given draft slot, for the whole draft. */
export function picksForSlot(config: LeagueConfig, slot: number): number[] {
  const picks: number[] = [];
  for (let round = 1; round <= config.draftRounds; round++) {
    const positionInRound =
      config.draftType === 'SNAKE' && round % 2 === 0
        ? config.teamCount - slot + 1
        : slot;
    picks.push((round - 1) * config.teamCount + positionInRound);
  }
  return picks;
}

/** How many selections happen between `fromOverall` (exclusive) and my next pick. */
export function picksUntilNextTurn(
  config: LeagueConfig,
  slot: number,
  fromOverall: number,
): number | null {
  const mine = picksForSlot(config, slot);
  const next = mine.find((p) => p > fromOverall);
  return next === undefined ? null : next - fromOverall - 1;
}
