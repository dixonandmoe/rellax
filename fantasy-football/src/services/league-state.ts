import { getProviders, resolveProviderMode, type ProviderMode } from '@/providers/registry';
import type { LeagueState } from '@/domain/types';
import type { ConnectionStatus } from '@/providers/types';

/**
 * League state assembly.
 *
 * Every page gets its data from here, so there is exactly one place that knows how to
 * turn providers into a `LeagueState`. Failures are carried alongside the data rather
 * than thrown, so a page can render "ESPN unreachable" next to whatever it does have.
 */

export interface LoadedLeagueState {
  state: LeagueState;
  mode: ProviderMode;
  /** True when the data is synthetic sample data. */
  isSample: boolean;
  status: ConnectionStatus;
  /** Non-fatal problems worth showing the user. */
  warnings: string[];
  asOf: string;
}

export async function loadLeagueState(
  options: { mode?: ProviderMode; week?: number } = {},
): Promise<LoadedLeagueState> {
  const mode = options.mode ?? resolveProviderMode();
  const providers = await getProviders(mode);
  const warnings: string[] = [];

  if (providers.fellBack) {
    warnings.push(
      'ESPN is selected but not configured, so the app is showing synthetic sample data. Add your league id and cookies on the ESPN Connection page.',
    );
  }

  const snapshot = await providers.league.getSnapshot();

  if (!snapshot.ok || !snapshot.data) {
    // Fall back to the sample so the UI can still render, but say so loudly.
    const sample = await getProviders('sample');
    const sampleSnapshot = await sample.league.getSnapshot();
    const sampleProjections = await sample.projections.getSeasonProjections(
      sampleSnapshot.data?.config.season ?? new Date().getFullYear(),
    );

    return {
      state: {
        config: sampleSnapshot.data!.config,
        teams: sampleSnapshot.data!.teams,
        players: sampleSnapshot.data!.players,
        seasonProjections: sampleProjections.data ?? [],
        weeklyProjections: [],
        injuries: [],
        adp: [],
        matchups: sampleSnapshot.data!.matchups,
        draft: sampleSnapshot.data!.draft,
        currentWeek: options.week ?? 0,
      },
      mode: 'sample',
      isSample: true,
      status: snapshot.status,
      warnings: [
        ...warnings,
        snapshot.message ?? 'The league provider returned no data; showing sample data instead.',
      ],
      asOf: snapshot.asOf,
    };
  }

  const { config, teams, players, draft, matchups } = snapshot.data;

  const [projections, freeAgents, injuries, adp] = await Promise.all([
    providers.projections.getSeasonProjections(config.season),
    providers.league.getFreeAgents(),
    providers.injuries.getInjuries(),
    providers.adp.getAdp(config.season, `${config.scoring.receptionPoints}ppr-${config.lineup.QB}qb-${config.teamCount}team`),
  ]);

  if (!projections.ok) {
    warnings.push(
      projections.message ??
        'No projections are available. Screens that depend on projections will show "Data unavailable".',
    );
  }
  if (!freeAgents.ok) {
    warnings.push(freeAgents.message ?? 'The free-agent pool could not be loaded.');
  }

  // Merge rostered players with the free-agent pool, de-duplicated by id.
  const allPlayers = [...players];
  const seen = new Set(players.map((p) => p.id));
  for (const player of freeAgents.data ?? []) {
    if (seen.has(player.id)) continue;
    seen.add(player.id);
    allPlayers.push(player);
  }

  const isSample = providers.mode === 'sample' || snapshot.source === 'synthetic-sample';

  return {
    state: {
      config,
      teams,
      players: allPlayers,
      seasonProjections: projections.data ?? [],
      weeklyProjections: [],
      injuries: injuries.data ?? [],
      adp: adp.data ?? [],
      matchups,
      draft,
      currentWeek: options.week ?? inferCurrentWeek(matchups),
    },
    mode: providers.mode,
    isSample,
    status: snapshot.status,
    warnings,
    asOf: snapshot.asOf,
  };
}

/** Current week = one past the last completed matchup week. */
export function inferCurrentWeek(matchups: LeagueState['matchups']): number {
  const completed = matchups.filter((m) => m.completed).map((m) => m.week);
  return completed.length > 0 ? Math.max(...completed) : 0;
}
