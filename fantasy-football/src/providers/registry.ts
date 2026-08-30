import type { DataProviderSet } from './types';
import { SampleProvider } from './sample/sample-provider';

/**
 * Provider registry.
 *
 * The rest of the app asks for providers here and never constructs one directly, so
 * switching from ESPN to manual to sample is a configuration change, not a code change.
 *
 * ESPN providers are imported lazily because their module is `server-only`; importing
 * them eagerly would make this registry unusable from any code path that a client
 * component can reach.
 */

export type ProviderMode = 'espn' | 'manual' | 'sample';

export function resolveProviderMode(): ProviderMode {
  const configured = process.env.LEAGUE_PROVIDER as ProviderMode | undefined;
  if (configured === 'espn' || configured === 'manual' || configured === 'sample') {
    return configured;
  }
  return process.env.ESPN_LEAGUE_ID ? 'espn' : 'sample';
}

/**
 * Build the provider set for the current configuration.
 *
 * Falls back to the sample provider when ESPN is selected but not configured, so the app
 * always renders — with an explicit banner saying the data is synthetic.
 */
export async function getProviders(
  mode: ProviderMode = resolveProviderMode(),
): Promise<DataProviderSet & { mode: ProviderMode; fellBack: boolean }> {
  const sample = new SampleProvider({ drafted: true });

  if (mode === 'espn') {
    const { EspnProvider, EspnProjectionProvider } = await import('./espn/espn-provider');
    const league = new EspnProvider();
    if (league.isConfigured()) {
      return {
        mode: 'espn',
        fellBack: false,
        league,
        players: sample,
        projections: new EspnProjectionProvider(),
        injuries: sample,
        news: sample,
        adp: sample,
      };
    }
    return { mode: 'sample', fellBack: true, league: sample, players: sample, projections: sample, injuries: sample, news: sample, adp: sample };
  }

  return {
    mode: mode === 'manual' ? 'manual' : 'sample',
    fellBack: false,
    league: sample,
    players: sample,
    projections: sample,
    injuries: sample,
    news: sample,
    adp: sample,
  };
}
