import { DEFAULT_LEAGUE_CONFIG, DEFAULT_SCORING } from '@/domain/league-config';
import type {
  DraftPick,
  DraftState,
  FantasyTeam,
  LeagueConfig,
  LineupSlot,
  Matchup,
  Player,
  PlayerStatus,
  Position,
  RosterEntry,
  StatLine,
} from '@/domain/types';
import type { TransactionRecord } from '../types';

/**
 * ESPN payload -> domain model.
 *
 * Kept separate from the client so the mapping can be unit-tested against captured
 * fixtures with no network. ESPN's shapes are numeric-coded, undocumented, and change
 * without notice, so every lookup here is total: an unknown code maps to a named unknown
 * rather than throwing or silently producing `undefined`.
 */

/** ESPN lineup slot ids. Source: observed values in the v3 API payloads. */
export const ESPN_SLOT_IDS: Record<number, LineupSlot> = {
  0: 'QB',
  2: 'RB',
  4: 'WR',
  6: 'TE',
  16: 'DST',
  17: 'K',
  20: 'BENCH',
  21: 'IR',
  23: 'FLEX',
};

/** ESPN position ids (defaultPositionId). */
export const ESPN_POSITION_IDS: Record<number, Position> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DST',
};

/** ESPN injury status strings we recognise. */
export const ESPN_INJURY_STATUS: Record<string, PlayerStatus> = {
  ACTIVE: 'ACTIVE',
  NORMAL: 'ACTIVE',
  QUESTIONABLE: 'QUESTIONABLE',
  DOUBTFUL: 'DOUBTFUL',
  OUT: 'OUT',
  INJURY_RESERVE: 'IR',
  SUSPENSION: 'SUSPENDED',
};

/**
 * ESPN stat ids -> our StatLine fields.
 *
 * Only the ids the scoring engine consumes are mapped. Anything else is ignored rather
 * than guessed at.
 */
export const ESPN_STAT_IDS: Record<number, keyof StatLine> = {
  3: 'passYards',
  4: 'passTd',
  20: 'interceptions',
  24: 'rushYards',
  25: 'rushTd',
  42: 'recYards',
  43: 'recTd',
  53: 'receptions',
  72: 'fumblesLost',
  // Kicking
  83: 'fgMade0to39',
  84: 'fgMade40to49',
  85: 'fgMade50Plus',
  86: 'patMade',
  // Defense
  99: 'sacks',
  95: 'defInterceptions',
  96: 'fumbleRecoveries',
  103: 'defTd',
  98: 'safeties',
  187: 'pointsAllowed',
};

export interface EspnLeaguePayload {
  id?: number;
  seasonId?: number;
  settings?: {
    name?: string;
    size?: number;
    rosterSettings?: { lineupSlotCounts?: Record<string, number> };
    scoringSettings?: {
      scoringItems?: Array<{ statId: number; points?: number; pointsOverrides?: Record<string, number> }>;
    };
    acquisitionSettings?: { acquisitionBudget?: number; waiverProcessDays?: string[]; isUsingAcquisitionBudget?: boolean };
    draftSettings?: { type?: string; pickOrder?: number[] };
    scheduleSettings?: { matchupPeriodCount?: number; playoffMatchupPeriodLength?: number; playoffTeamCount?: number };
  };
  teams?: EspnTeamPayload[];
  schedule?: EspnScheduleItem[];
  draftDetail?: { drafted?: boolean; picks?: EspnDraftPick[] };
  transactions?: EspnTransaction[];
  players?: Array<{ player?: EspnPlayer }>;
}

export interface EspnTeamPayload {
  id: number;
  name?: string;
  location?: string;
  nickname?: string;
  abbrev?: string;
  owners?: string[];
  record?: { overall?: { wins?: number; losses?: number; ties?: number; pointsFor?: number; pointsAgainst?: number } };
  transactionCounter?: { acquisitionBudgetSpent?: number };
  draftDayProjectedRank?: number;
  roster?: { entries?: EspnRosterEntry[] };
}

export interface EspnRosterEntry {
  playerId: number;
  lineupSlotId?: number;
  acquisitionType?: string;
  playerPoolEntry?: { player?: EspnPlayer };
}

export interface EspnPlayer {
  id: number;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  defaultPositionId?: number;
  proTeamId?: number;
  injuryStatus?: string;
  injured?: boolean;
  stats?: EspnStatEntry[];
}

export interface EspnStatEntry {
  statSourceId?: number;
  statSplitTypeId?: number;
  scoringPeriodId?: number;
  seasonId?: number;
  stats?: Record<string, number>;
  appliedTotal?: number;
}

export interface EspnScheduleItem {
  matchupPeriodId: number;
  home?: { teamId: number; totalPoints?: number };
  away?: { teamId: number; totalPoints?: number };
  playoffTierType?: string;
  winner?: string;
}

export interface EspnDraftPick {
  playerId: number;
  teamId: number;
  overallPickNumber: number;
  roundId: number;
  roundPickNumber: number;
  keeper?: boolean;
  bidAmount?: number;
}

export interface EspnTransaction {
  id?: string;
  type?: string;
  scoringPeriodId?: number;
  teamId?: number;
  bidAmount?: number;
  proposedDate?: number;
  items?: Array<{ playerId?: number; type?: string }>;
}

/** ESPN pro team ids -> abbreviations, for bye weeks and schedule display. */
export const ESPN_PRO_TEAMS: Record<number, string> = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
  9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA',
  16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI',
  23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR',
  30: 'JAX', 33: 'BAL', 34: 'HOU',
};

export function mapLeagueConfig(
  payload: EspnLeaguePayload,
  fallback: LeagueConfig = DEFAULT_LEAGUE_CONFIG,
): LeagueConfig {
  const settings = payload.settings;
  const slotCounts = settings?.rosterSettings?.lineupSlotCounts ?? {};

  const slot = (id: number, fallbackValue: number) => {
    const value = slotCounts[String(id)];
    return typeof value === 'number' ? value : fallbackValue;
  };

  return {
    ...fallback,
    id: String(payload.id ?? fallback.id),
    name: settings?.name ?? fallback.name,
    season: payload.seasonId ?? fallback.season,
    teamCount: settings?.size ?? payload.teams?.length ?? fallback.teamCount,
    scoring: mapScoring(payload, fallback),
    lineup: {
      QB: slot(0, fallback.lineup.QB),
      RB: slot(2, fallback.lineup.RB),
      WR: slot(4, fallback.lineup.WR),
      TE: slot(6, fallback.lineup.TE),
      FLEX: slot(23, fallback.lineup.FLEX),
      SUPERFLEX: slot(7, fallback.lineup.SUPERFLEX),
      K: slot(17, fallback.lineup.K),
      DST: slot(16, fallback.lineup.DST),
      BENCH: slot(20, fallback.lineup.BENCH),
      IR: slot(21, fallback.lineup.IR),
    },
    waiverType: settings?.acquisitionSettings?.isUsingAcquisitionBudget ? 'FAAB' : fallback.waiverType,
    faabBudget: settings?.acquisitionSettings?.acquisitionBudget ?? fallback.faabBudget,
    draftType: settings?.draftSettings?.type === 'AUCTION' ? 'AUCTION' : fallback.draftType,
    regularSeasonWeeks:
      settings?.scheduleSettings?.matchupPeriodCount ?? fallback.regularSeasonWeeks,
    playoffTeams: settings?.scheduleSettings?.playoffTeamCount ?? fallback.playoffTeams,
  };
}

/**
 * Map ESPN's scoring items onto our rules.
 *
 * ESPN expresses scoring as points-per-unit for a stat id. We convert the yardage
 * entries into our "yards per point" form, and leave anything we do not recognise on the
 * league's existing value rather than assuming zero.
 */
export function mapScoring(
  payload: EspnLeaguePayload,
  fallback: LeagueConfig,
): LeagueConfig['scoring'] {
  const items = payload.settings?.scoringSettings?.scoringItems ?? [];
  const byStat = new Map<number, number>();
  for (const item of items) {
    if (typeof item.points === 'number') byStat.set(item.statId, item.points);
  }

  const perUnit = (statId: number, fallbackValue: number) =>
    byStat.has(statId) ? byStat.get(statId)! : fallbackValue;

  const yardsPerPoint = (statId: number, fallbackValue: number) => {
    const pointsPerYard = byStat.get(statId);
    if (!pointsPerYard || pointsPerYard === 0) return fallbackValue;
    return 1 / pointsPerYard;
  };

  return {
    ...DEFAULT_SCORING,
    ...fallback.scoring,
    passYardsPerPoint: yardsPerPoint(3, fallback.scoring.passYardsPerPoint),
    passTdPoints: perUnit(4, fallback.scoring.passTdPoints),
    passIntPoints: perUnit(20, fallback.scoring.passIntPoints),
    rushYardsPerPoint: yardsPerPoint(24, fallback.scoring.rushYardsPerPoint),
    rushTdPoints: perUnit(25, fallback.scoring.rushTdPoints),
    recYardsPerPoint: yardsPerPoint(42, fallback.scoring.recYardsPerPoint),
    recTdPoints: perUnit(43, fallback.scoring.recTdPoints),
    receptionPoints: perUnit(53, fallback.scoring.receptionPoints),
    fumbleLostPoints: perUnit(72, fallback.scoring.fumbleLostPoints),
  };
}

export function mapPlayer(player: EspnPlayer, asOf: string): Player {
  return {
    id: `espn-${player.id}`,
    name: player.fullName ?? [player.firstName, player.lastName].filter(Boolean).join(' ') ?? `Player ${player.id}`,
    position: ESPN_POSITION_IDS[player.defaultPositionId ?? -1] ?? 'WR',
    nflTeam: ESPN_PRO_TEAMS[player.proTeamId ?? -1],
    status: mapInjuryStatus(player.injuryStatus),
    source: 'espn',
    asOf,
  };
}

export function mapInjuryStatus(status: string | undefined): PlayerStatus {
  if (!status) return 'ACTIVE';
  return ESPN_INJURY_STATUS[status.toUpperCase()] ?? 'ACTIVE';
}

export function mapTeam(
  team: EspnTeamPayload,
  faabBudget: number,
  myTeamExternalId?: string,
): FantasyTeam {
  const record = team.record?.overall;
  const spent = team.transactionCounter?.acquisitionBudgetSpent ?? 0;

  return {
    id: `espn-team-${team.id}`,
    name:
      team.name ??
      [team.location, team.nickname].filter(Boolean).join(' ') ??
      `Team ${team.id}`,
    ownerName: team.owners?.[0],
    isMyTeam: myTeamExternalId !== undefined && String(team.id) === myTeamExternalId,
    roster: (team.roster?.entries ?? []).map(mapRosterEntry),
    faabRemaining: Math.max(0, faabBudget - spent),
    wins: record?.wins ?? 0,
    losses: record?.losses ?? 0,
    ties: record?.ties ?? 0,
    pointsFor: record?.pointsFor ?? 0,
    pointsAgainst: record?.pointsAgainst ?? 0,
  };
}

export function mapRosterEntry(entry: EspnRosterEntry): RosterEntry {
  return {
    playerId: `espn-${entry.playerId}`,
    slot: ESPN_SLOT_IDS[entry.lineupSlotId ?? 20] ?? 'BENCH',
    acquisitionType: mapAcquisitionType(entry.acquisitionType),
  };
}

function mapAcquisitionType(type: string | undefined): RosterEntry['acquisitionType'] {
  switch (type) {
    case 'DRAFT':
      return 'DRAFT';
    case 'WAIVER':
      return 'WAIVER';
    case 'ADD':
    case 'FREEAGENT':
      return 'FREEAGENT';
    case 'TRADE':
      return 'TRADE';
    default:
      return undefined;
  }
}

export function mapDraft(payload: EspnLeaguePayload, teamIds: string[]): DraftState {
  const rawPicks = payload.draftDetail?.picks ?? [];
  const picks: DraftPick[] = rawPicks
    .filter((pick) => pick.overallPickNumber > 0)
    .map((pick) => ({
      overall: pick.overallPickNumber,
      round: pick.roundId,
      pickInRound: pick.roundPickNumber,
      teamId: `espn-team-${pick.teamId}`,
      playerId: pick.playerId > 0 ? `espn-${pick.playerId}` : undefined,
      keeper: pick.keeper ?? false,
    }))
    .sort((a, b) => a.overall - b.overall);

  // Draft order comes from round 1's picks when available; fall back to team order.
  const roundOne = picks.filter((p) => p.round === 1).sort((a, b) => a.pickInRound - b.pickInRound);
  const draftOrder = roundOne.length > 0 ? roundOne.map((p) => p.teamId) : teamIds;

  return {
    picks,
    currentOverall: picks.length + 1,
    draftOrder,
    complete: payload.draftDetail?.drafted ?? false,
  };
}

export function mapMatchups(payload: EspnLeaguePayload): Matchup[] {
  return (payload.schedule ?? [])
    .filter((item) => item.home?.teamId !== undefined && item.away?.teamId !== undefined)
    .map((item) => ({
      week: item.matchupPeriodId,
      homeTeamId: `espn-team-${item.home!.teamId}`,
      awayTeamId: `espn-team-${item.away!.teamId}`,
      homeScore: item.home?.totalPoints,
      awayScore: item.away?.totalPoints,
      isPlayoff: item.playoffTierType !== undefined && item.playoffTierType !== 'NONE',
      completed: item.winner !== undefined && item.winner !== 'UNDECIDED',
    }));
}

export function mapTransactions(payload: EspnLeaguePayload): TransactionRecord[] {
  return (payload.transactions ?? []).map((transaction) => ({
    externalId: transaction.id ?? `${transaction.teamId}-${transaction.proposedDate}`,
    type: mapTransactionType(transaction.type),
    week: transaction.scoringPeriodId,
    teamExternalId: transaction.teamId !== undefined ? String(transaction.teamId) : undefined,
    playerExternalIds: (transaction.items ?? [])
      .map((item) => item.playerId)
      .filter((id): id is number => typeof id === 'number')
      .map((id) => `espn-${id}`),
    bidAmount: transaction.bidAmount,
    executedAt: transaction.proposedDate
      ? new Date(transaction.proposedDate).toISOString()
      : new Date().toISOString(),
  }));
}

function mapTransactionType(type: string | undefined): TransactionRecord['type'] {
  switch (type) {
    case 'WAIVER':
      return 'WAIVER';
    case 'TRADE_ACCEPT':
    case 'TRADE':
      return 'TRADE';
    case 'FREEAGENT':
      return 'ADD';
    case 'DRAFT':
      return 'DRAFT';
    case 'ROSTER':
      return 'DROP';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Extract a stat line from an ESPN player's stats array.
 *
 * `statSourceId === 1` is a projection, `0` is actual. `scoringPeriodId === 0` is the
 * full season. Both must be checked — asking for "the stats" without them returns a
 * mixture of actuals and projections.
 */
export function extractStatLine(
  player: EspnPlayer,
  options: { projected: boolean; week?: number; season?: number },
): StatLine | null {
  const wantSource = options.projected ? 1 : 0;
  const wantPeriod = options.week ?? 0;

  const entry = (player.stats ?? []).find(
    (stat) =>
      stat.statSourceId === wantSource &&
      (stat.scoringPeriodId ?? 0) === wantPeriod &&
      (options.season === undefined || stat.seasonId === options.season),
  );
  if (!entry?.stats) return null;

  const line: StatLine = {};
  for (const [statId, value] of Object.entries(entry.stats)) {
    const field = ESPN_STAT_IDS[Number(statId)];
    if (field && typeof value === 'number') {
      line[field] = value;
    }
  }
  return Object.keys(line).length > 0 ? line : null;
}
