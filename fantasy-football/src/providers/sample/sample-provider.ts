import type { AdpEntry, InjuryReport, LeagueConfig, Matchup, Player, Projection } from '@/domain/types';
import type { DraftState, FantasyTeam } from '@/domain/types';
import {
  providerOk,
  type AdpProvider,
  type InjuryProvider,
  type LeagueProvider,
  type LeagueSnapshot,
  type NewsItem,
  type NewsProvider,
  type PlayerStatsProvider,
  type ProjectionProvider,
  type ProviderResult,
  type TransactionRecord,
} from '../types';
import {
  SAMPLE_SOURCE,
  buildSampleLeagueState,
  buildSamplePlayers,
  buildSampleProjections,
} from './sample-league';

/**
 * Sample provider — synthetic data for development and demos.
 *
 * Everything it returns is tagged `synthetic-sample`, which the UI renders as a warning
 * banner. It exists so the app is explorable without ESPN credentials, and so no screen
 * has to be built against invented "realistic" player numbers.
 */
export class SampleProvider
  implements
    LeagueProvider,
    PlayerStatsProvider,
    ProjectionProvider,
    InjuryProvider,
    NewsProvider,
    AdpProvider
{
  readonly name = SAMPLE_SOURCE;

  constructor(private readonly options: { drafted?: boolean } = {}) {}

  isConfigured(): boolean {
    return true;
  }

  private state() {
    return buildSampleLeagueState({ drafted: this.options.drafted });
  }

  async getLeagueSettings(): Promise<ProviderResult<LeagueConfig>> {
    return providerOk(this.state().config, SAMPLE_SOURCE);
  }

  async getTeams(): Promise<ProviderResult<FantasyTeam[]>> {
    return providerOk(this.state().teams, SAMPLE_SOURCE);
  }

  async getRosters(): Promise<ProviderResult<FantasyTeam[]>> {
    return this.getTeams();
  }

  async getDraftResults(): Promise<ProviderResult<DraftState>> {
    const state = this.state();
    return providerOk(
      state.draft ?? {
        picks: [],
        currentOverall: 1,
        draftOrder: state.teams.map((t) => t.id),
        complete: false,
      },
      SAMPLE_SOURCE,
    );
  }

  async getMatchups(): Promise<ProviderResult<Matchup[]>> {
    const state = this.state();
    return providerOk(buildSampleSchedule(state.teams, state.config), SAMPLE_SOURCE);
  }

  async getTransactions(): Promise<ProviderResult<TransactionRecord[]>> {
    return providerOk([], SAMPLE_SOURCE);
  }

  async getFreeAgents(): Promise<ProviderResult<Player[]>> {
    const state = this.state();
    const rostered = new Set(state.teams.flatMap((t) => t.roster.map((r) => r.playerId)));
    return providerOk(
      state.players.filter((p) => !rostered.has(p.id)),
      SAMPLE_SOURCE,
    );
  }

  async getSnapshot(): Promise<ProviderResult<LeagueSnapshot>> {
    const state = this.state();
    return providerOk(
      {
        config: state.config,
        teams: state.teams,
        players: state.players,
        draft: state.draft,
        matchups: buildSampleSchedule(state.teams, state.config),
      },
      SAMPLE_SOURCE,
    );
  }

  async getPlayers(): Promise<ProviderResult<Player[]>> {
    return providerOk(buildSamplePlayers(), SAMPLE_SOURCE);
  }

  async getSeasonProjections(season: number): Promise<ProviderResult<Projection[]>> {
    return providerOk(buildSampleProjections(season), SAMPLE_SOURCE);
  }

  async getWeeklyProjections(): Promise<ProviderResult<Projection[]>> {
    // The sample set deliberately has no weekly projections, so playoff analysis
    // exercises its "data unavailable" path rather than inventing a weekly split.
    return providerOk([], SAMPLE_SOURCE);
  }

  async getInjuries(): Promise<ProviderResult<InjuryReport[]>> {
    return providerOk([], SAMPLE_SOURCE);
  }

  async getNews(): Promise<ProviderResult<NewsItem[]>> {
    return providerOk([], SAMPLE_SOURCE);
  }

  async getAdp(): Promise<ProviderResult<AdpEntry[]>> {
    return providerOk([], SAMPLE_SOURCE);
  }
}

/** Round-robin schedule for the sample league. */
export function buildSampleSchedule(teams: FantasyTeam[], config: LeagueConfig): Matchup[] {
  const matchups: Matchup[] = [];
  const ids = teams.map((t) => t.id);
  if (ids.length < 2) return matchups;

  const totalWeeks = config.regularSeasonWeeks + config.playoffWeeks.length;
  const rotating = ids.slice(1);

  for (let week = 1; week <= totalWeeks; week++) {
    const offset = (week - 1) % rotating.length;
    const ordered = [ids[0]!, ...rotating.slice(offset), ...rotating.slice(0, offset)];
    for (let i = 0; i < Math.floor(ordered.length / 2); i++) {
      matchups.push({
        week,
        homeTeamId: ordered[i]!,
        awayTeamId: ordered[ordered.length - 1 - i]!,
        isPlayoff: config.playoffWeeks.includes(week),
        completed: false,
      });
    }
  }

  return matchups;
}
