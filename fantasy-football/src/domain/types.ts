/**
 * Canonical domain types.
 *
 * Everything in `src/domain` operates on these types only. No Prisma types, no ESPN
 * shapes, no React. Providers map their payloads into these; engines consume them.
 */

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const;
export type Position = (typeof POSITIONS)[number];

export const FLEX_POSITIONS: readonly Position[] = ['RB', 'WR', 'TE'];
export const SUPERFLEX_POSITIONS: readonly Position[] = ['QB', 'RB', 'WR', 'TE'];

export type LineupSlot =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'FLEX'
  | 'SUPERFLEX'
  | 'K'
  | 'DST'
  | 'BENCH'
  | 'IR';

export type PlayerStatus =
  | 'ACTIVE'
  | 'QUESTIONABLE'
  | 'DOUBTFUL'
  | 'OUT'
  | 'IR'
  | 'SUSPENDED';

/** Raw statistical line. Points are always derived from this, never trusted from a feed. */
export interface StatLine {
  passYards?: number;
  passTd?: number;
  interceptions?: number;
  passTwoPt?: number;
  rushYards?: number;
  rushTd?: number;
  rushTwoPt?: number;
  receptions?: number;
  recYards?: number;
  recTd?: number;
  recTwoPt?: number;
  fumblesLost?: number;
  // Kicking
  fgMade0to39?: number;
  fgMade40to49?: number;
  fgMade50Plus?: number;
  fgMissed?: number;
  patMade?: number;
  patMissed?: number;
  // Defense / special teams
  sacks?: number;
  defInterceptions?: number;
  fumbleRecoveries?: number;
  defTd?: number;
  safeties?: number;
  pointsAllowed?: number;
  yardsAllowed?: number;
}

/** Opportunity metrics. Optional — absent means "unknown", never zero. */
export interface OpportunityMetrics {
  snapPct?: number;
  targetShare?: number;
  rushShare?: number;
  redZoneTouches?: number;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  nflTeam?: string;
  byeWeek?: number;
  status: PlayerStatus;
  age?: number;
  /** Data provenance — surfaced in the UI, required on every player. */
  source: string;
  asOf: string;
}

export interface Projection {
  playerId: string;
  season: number;
  /** null/undefined = full season */
  week?: number;
  stats: StatLine;
  opportunity?: OpportunityMetrics;
  source: string;
  asOf: string;
}

export interface RosterEntry {
  playerId: string;
  slot: LineupSlot;
  acquisitionType?: 'DRAFT' | 'WAIVER' | 'FREEAGENT' | 'TRADE';
  faabSpent?: number;
}

export interface FantasyTeam {
  id: string;
  name: string;
  ownerName?: string;
  isMyTeam: boolean;
  draftSlot?: number;
  roster: RosterEntry[];
  faabRemaining: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface DraftPick {
  overall: number;
  round: number;
  pickInRound: number;
  teamId: string;
  playerId?: string;
  keeper?: boolean;
}

export interface DraftState {
  /** Picks already made, in order. */
  picks: DraftPick[];
  /** 1-indexed overall number of the pick on the clock. */
  currentOverall: number;
  /** Team id order for round 1; snake/linear applied from league config. */
  draftOrder: string[];
  complete: boolean;
}

export interface Matchup {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  isPlayoff: boolean;
  completed: boolean;
}

export interface AdpEntry {
  playerId: string;
  adp: number;
  stdDev?: number;
  format: string;
  source: string;
  asOf: string;
}

export interface InjuryReport {
  playerId: string;
  status: PlayerStatus;
  designation?: string;
  expectedBackWeek?: number;
  note?: string;
  source: string;
  asOf: string;
}

/**
 * The single input to every engine. Assembled once per request by
 * `src/services/league-state.ts`.
 */
export interface LeagueState {
  config: LeagueConfig;
  teams: FantasyTeam[];
  players: Player[];
  /** Season-long projections keyed by playerId. */
  seasonProjections: Projection[];
  /** Weekly projections; may be empty outside the season. */
  weeklyProjections: Projection[];
  injuries: InjuryReport[];
  adp: AdpEntry[];
  matchups: Matchup[];
  draft?: DraftState;
  /** Ids of players on no roster. Derived, but cached here for engine convenience. */
  currentWeek?: number;
}

// ---------------------------------------------------------------------------
// League configuration
// ---------------------------------------------------------------------------

export interface ScoringRules {
  passYardsPerPoint: number;
  passTdPoints: number;
  passIntPoints: number;
  passTwoPtPoints: number;
  rushYardsPerPoint: number;
  rushTdPoints: number;
  recYardsPerPoint: number;
  recTdPoints: number;
  receptionPoints: number;
  twoPtPoints: number;
  fumbleLostPoints: number;
  // Kicking
  fg0to39Points: number;
  fg40to49Points: number;
  fg50PlusPoints: number;
  fgMissPoints: number;
  patPoints: number;
  patMissPoints: number;
  // Defense
  sackPoints: number;
  defIntPoints: number;
  fumbleRecoveryPoints: number;
  defTdPoints: number;
  safetyPoints: number;
  /** Ascending upper bounds -> points, e.g. [{max:0,points:10},{max:6,points:7}] */
  pointsAllowedTiers: Array<{ max: number; points: number }>;
}

export interface LineupRequirements {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  SUPERFLEX: number;
  K: number;
  DST: number;
  BENCH: number;
  IR: number;
}

export interface LeagueConfig {
  id: string;
  name: string;
  season: number;
  teamCount: number;
  scoring: ScoringRules;
  lineup: LineupRequirements;
  /** Positions each FLEX slot accepts. Defaults to RB/WR/TE. */
  flexEligibility: readonly Position[];
  superflexEligibility: readonly Position[];
  waiverType: 'FAAB' | 'ROLLING' | 'REVERSE';
  faabBudget: number;
  draftType: 'SNAKE' | 'LINEAR' | 'AUCTION';
  draftRounds: number;
  myDraftSlot?: number;
  regularSeasonWeeks: number;
  playoffWeeks: number[];
  playoffTeams: number;
  dynastyEnabled: boolean;
  seasonMode: 'PREDRAFT' | 'DRAFT' | 'SEASON' | 'PLAYOFFS';
}
