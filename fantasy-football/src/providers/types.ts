import type {
  AdpEntry,
  FantasyTeam,
  InjuryReport,
  LeagueConfig,
  Matchup,
  Player,
  Projection,
  DraftState,
} from '@/domain/types';

/**
 * Provider abstraction.
 *
 * NOTHING outside `src/providers/**` may make an HTTP request to an external data
 * source. Everything the app knows about the outside world arrives through these
 * interfaces, so ESPN can be swapped for Sleeper, Yahoo, or pure manual import without
 * touching an engine, a service, or a page.
 */

export type ConnectionStatus =
  | 'CONNECTED'
  | 'NOT_CONFIGURED'
  | 'AUTH_EXPIRED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR';

/**
 * Every provider call returns this envelope. A failure is never an empty array — the UI
 * must be able to tell "this team has no players" apart from "we could not reach ESPN".
 */
export interface ProviderResult<T> {
  ok: boolean;
  data: T | null;
  status: ConnectionStatus;
  /** Where this came from, e.g. "espn" or "synthetic-sample". */
  source: string;
  /** When the data was retrieved. */
  asOf: string;
  /** Human-readable problem description when ok is false. */
  message?: string;
}

export function providerOk<T>(data: T, source: string): ProviderResult<T> {
  return { ok: true, data, status: 'CONNECTED', source, asOf: new Date().toISOString() };
}

export function providerError<T>(
  status: ConnectionStatus,
  source: string,
  message: string,
): ProviderResult<T> {
  return { ok: false, data: null, status, source, asOf: new Date().toISOString(), message };
}

export interface LeagueSnapshot {
  config: LeagueConfig;
  teams: FantasyTeam[];
  players: Player[];
  draft?: DraftState;
  matchups: Matchup[];
}

/** League structure, teams, rosters, draft, matchups. */
export interface LeagueProvider {
  readonly name: string;
  /** Is this provider configured well enough to try? */
  isConfigured(): boolean;
  getLeagueSettings(): Promise<ProviderResult<LeagueConfig>>;
  getTeams(): Promise<ProviderResult<FantasyTeam[]>>;
  getRosters(week?: number): Promise<ProviderResult<FantasyTeam[]>>;
  getDraftResults(): Promise<ProviderResult<DraftState>>;
  getMatchups(): Promise<ProviderResult<Matchup[]>>;
  getFreeAgents(limit?: number): Promise<ProviderResult<Player[]>>;
  getTransactions(week?: number): Promise<ProviderResult<TransactionRecord[]>>;
  /** Everything at once, for a full sync. */
  getSnapshot(): Promise<ProviderResult<LeagueSnapshot>>;
}

export interface TransactionRecord {
  externalId: string;
  type: 'ADD' | 'DROP' | 'TRADE' | 'WAIVER' | 'DRAFT' | 'UNKNOWN';
  week?: number;
  teamExternalId?: string;
  playerExternalIds: string[];
  bidAmount?: number;
  executedAt: string;
}

/** Player identity and metadata. */
export interface PlayerStatsProvider {
  readonly name: string;
  isConfigured(): boolean;
  getPlayers(season: number): Promise<ProviderResult<Player[]>>;
}

/** Projections. Always returns stat lines, never points. */
export interface ProjectionProvider {
  readonly name: string;
  isConfigured(): boolean;
  getSeasonProjections(season: number): Promise<ProviderResult<Projection[]>>;
  getWeeklyProjections(season: number, week: number): Promise<ProviderResult<Projection[]>>;
}

export interface InjuryProvider {
  readonly name: string;
  isConfigured(): boolean;
  getInjuries(): Promise<ProviderResult<InjuryReport[]>>;
}

export interface NewsProvider {
  readonly name: string;
  isConfigured(): boolean;
  getNews(playerIds?: string[]): Promise<ProviderResult<NewsItem[]>>;
}

export interface NewsItem {
  playerId: string;
  headline: string;
  body?: string;
  url?: string;
  published: string;
}

export interface AdpProvider {
  readonly name: string;
  isConfigured(): boolean;
  getAdp(season: number, format: string): Promise<ProviderResult<AdpEntry[]>>;
}

/** The full set of providers the app is running with. */
export interface DataProviderSet {
  league: LeagueProvider;
  players: PlayerStatsProvider;
  projections: ProjectionProvider;
  injuries: InjuryProvider;
  news: NewsProvider;
  adp: AdpProvider;
}
