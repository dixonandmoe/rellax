import 'server-only';

import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import type {
  DraftState,
  FantasyTeam,
  LeagueConfig,
  Matchup,
  Player,
  Projection,
} from '@/domain/types';
import {
  credentialsFromEnv,
  describeStatus,
  espnFetch,
  leagueUrl,
  playersUrl,
  type EspnCredentials,
} from './client';
import {
  extractStatLine,
  mapDraft,
  mapLeagueConfig,
  mapMatchups,
  mapPlayer,
  mapTeam,
  mapTransactions,
  type EspnLeaguePayload,
  type EspnPlayer,
} from './mappers';
import {
  providerError,
  providerOk,
  type LeagueProvider,
  type LeagueSnapshot,
  type ProjectionProvider,
  type ProviderResult,
  type TransactionRecord,
} from '../types';

/**
 * ESPN league provider.
 *
 * Cache TTLs reflect how fast each thing actually changes: league settings almost never,
 * rosters between waiver runs, free agents constantly during a draft.
 */
const TTL_SETTINGS = 10 * 60 * 1000;
const TTL_ROSTERS = 5 * 60 * 1000;
const TTL_DRAFT = 5 * 1000;
const TTL_FREE_AGENTS = 60 * 1000;

export interface EspnProviderOptions {
  credentials?: EspnCredentials | null;
  /** ESPN team id (not our prefixed id) identifying which team is mine. */
  myTeamExternalId?: string;
}

export class EspnProvider implements LeagueProvider {
  readonly name = 'espn';
  private readonly credentials: EspnCredentials | null;
  private readonly myTeamExternalId?: string;

  constructor(options: EspnProviderOptions = {}) {
    this.credentials = options.credentials ?? credentialsFromEnv();
    this.myTeamExternalId = options.myTeamExternalId ?? process.env.ESPN_TEAM_ID;
  }

  isConfigured(): boolean {
    return Boolean(this.credentials?.leagueId && this.credentials?.season);
  }

  /** True when private-league cookies are present. */
  hasPrivateLeagueCredentials(): boolean {
    return Boolean(this.credentials?.espnS2 && this.credentials?.swid);
  }

  private notConfigured<T>(): ProviderResult<T> {
    return providerError<T>('NOT_CONFIGURED', 'espn', describeStatus('NOT_CONFIGURED'));
  }

  private async fetchLeague(
    views: string[],
    cacheTtlMs: number,
  ): Promise<ProviderResult<EspnLeaguePayload>> {
    if (!this.credentials) return this.notConfigured();
    return espnFetch<EspnLeaguePayload>(leagueUrl(this.credentials), this.credentials, {
      views,
      cacheTtlMs,
    });
  }

  async getLeagueSettings(): Promise<ProviderResult<LeagueConfig>> {
    const result = await this.fetchLeague(['mSettings'], TTL_SETTINGS);
    if (!result.ok || !result.data) return { ...result, data: null } as ProviderResult<LeagueConfig>;
    return { ...result, data: mapLeagueConfig(result.data) };
  }

  async getTeams(): Promise<ProviderResult<FantasyTeam[]>> {
    return this.getRosters();
  }

  async getRosters(): Promise<ProviderResult<FantasyTeam[]>> {
    const result = await this.fetchLeague(['mTeam', 'mRoster', 'mSettings'], TTL_ROSTERS);
    if (!result.ok || !result.data) return { ...result, data: null } as ProviderResult<FantasyTeam[]>;

    const config = mapLeagueConfig(result.data);
    const teams = (result.data.teams ?? []).map((team) =>
      mapTeam(team, config.faabBudget, this.myTeamExternalId),
    );
    return { ...result, data: teams };
  }

  async getDraftResults(): Promise<ProviderResult<DraftState>> {
    const result = await this.fetchLeague(['mDraftDetail', 'mTeam'], TTL_DRAFT);
    if (!result.ok || !result.data) return { ...result, data: null } as ProviderResult<DraftState>;
    const teamIds = (result.data.teams ?? []).map((t) => `espn-team-${t.id}`);
    return { ...result, data: mapDraft(result.data, teamIds) };
  }

  async getMatchups(): Promise<ProviderResult<Matchup[]>> {
    const result = await this.fetchLeague(['mMatchup', 'mMatchupScore'], TTL_ROSTERS);
    if (!result.ok || !result.data) return { ...result, data: null } as ProviderResult<Matchup[]>;
    return { ...result, data: mapMatchups(result.data) };
  }

  async getTransactions(): Promise<ProviderResult<TransactionRecord[]>> {
    const result = await this.fetchLeague(['mTransactions2'], TTL_ROSTERS);
    if (!result.ok || !result.data) {
      return { ...result, data: null } as ProviderResult<TransactionRecord[]>;
    }
    return { ...result, data: mapTransactions(result.data) };
  }

  /**
   * Free agents / waiver pool.
   *
   * Requires the X-Fantasy-Filter header — without it ESPN caps the response at ~50
   * players regardless of the pool size.
   */
  async getFreeAgents(limit = 300): Promise<ProviderResult<Player[]>> {
    if (!this.credentials) return this.notConfigured();

    const result = await espnFetch<{ players?: Array<{ player?: EspnPlayer }> }>(
      leagueUrl(this.credentials),
      this.credentials,
      {
        views: ['kona_player_info'],
        cacheTtlMs: TTL_FREE_AGENTS,
        filter: {
          players: {
            limit,
            filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
            sortPercOwned: { sortAsc: false, sortPriority: 1 },
          },
        },
      },
    );

    if (!result.ok || !result.data) return { ...result, data: null } as ProviderResult<Player[]>;

    const asOf = result.asOf;
    const players = (result.data.players ?? [])
      .map((entry) => entry.player)
      .filter((p): p is EspnPlayer => Boolean(p))
      .map((p) => mapPlayer(p, asOf));

    return { ...result, data: players };
  }

  async getSnapshot(): Promise<ProviderResult<LeagueSnapshot>> {
    if (!this.credentials) return this.notConfigured();

    const result = await this.fetchLeague(
      ['mSettings', 'mTeam', 'mRoster', 'mMatchup', 'mDraftDetail'],
      TTL_ROSTERS,
    );
    if (!result.ok || !result.data) {
      return { ...result, data: null } as ProviderResult<LeagueSnapshot>;
    }

    const payload = result.data;
    const config = mapLeagueConfig(payload);
    const teams = (payload.teams ?? []).map((team) =>
      mapTeam(team, config.faabBudget, this.myTeamExternalId),
    );

    // Players on rosters come embedded in mRoster.
    const players: Player[] = [];
    const seen = new Set<string>();
    for (const team of payload.teams ?? []) {
      for (const entry of team.roster?.entries ?? []) {
        const player = entry.playerPoolEntry?.player;
        if (!player) continue;
        const mapped = mapPlayer(player, result.asOf);
        if (seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        players.push(mapped);
      }
    }

    return {
      ...result,
      data: {
        config,
        teams,
        players,
        draft: mapDraft(payload, teams.map((t) => t.id)),
        matchups: mapMatchups(payload),
      },
    };
  }
}

/**
 * ESPN projection provider.
 *
 * ESPN's projections are recomputed against *your* league scoring by the domain layer —
 * we take the raw stat line and ignore ESPN's own `appliedTotal`, which reflects ESPN's
 * scoring settings and can disagree with a custom league. See ESPN_INTEGRATION.md §6.
 */
export class EspnProjectionProvider implements ProjectionProvider {
  readonly name = 'espn';
  private readonly credentials: EspnCredentials | null;

  constructor(credentials?: EspnCredentials | null) {
    this.credentials = credentials ?? credentialsFromEnv();
  }

  isConfigured(): boolean {
    return Boolean(this.credentials?.leagueId);
  }

  async getSeasonProjections(season: number): Promise<ProviderResult<Projection[]>> {
    return this.fetchProjections(season, undefined);
  }

  async getWeeklyProjections(season: number, week: number): Promise<ProviderResult<Projection[]>> {
    return this.fetchProjections(season, week);
  }

  private async fetchProjections(
    season: number,
    week: number | undefined,
  ): Promise<ProviderResult<Projection[]>> {
    if (!this.credentials) {
      return providerError('NOT_CONFIGURED', 'espn', describeStatus('NOT_CONFIGURED'));
    }

    const result = await espnFetch<{ players?: Array<{ player?: EspnPlayer }> }>(
      leagueUrl({ ...this.credentials, season }),
      this.credentials,
      {
        views: ['kona_player_info'],
        scoringPeriodId: week,
        cacheTtlMs: TTL_SETTINGS,
        filter: { players: { limit: 1000, sortPercOwned: { sortAsc: false, sortPriority: 1 } } },
      },
    );

    if (!result.ok || !result.data) {
      return { ...result, data: null } as ProviderResult<Projection[]>;
    }

    const projections: Projection[] = [];
    for (const entry of result.data.players ?? []) {
      const player = entry.player;
      if (!player) continue;
      const stats = extractStatLine(player, { projected: true, week, season });
      if (!stats) continue; // no projection is reported as absent, not as zero
      projections.push({
        playerId: `espn-${player.id}`,
        season,
        week,
        stats,
        source: 'espn',
        asOf: result.asOf,
      });
    }

    return { ...result, data: projections };
  }
}

/** Convenience: a fully-wired ESPN provider pair, or null when not configured. */
export function createEspnProvider(options: EspnProviderOptions = {}): EspnProvider | null {
  const provider = new EspnProvider(options);
  return provider.isConfigured() ? provider : null;
}

export { DEFAULT_LEAGUE_CONFIG, providerOk };
