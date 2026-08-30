import 'server-only';

import type { ConnectionStatus, ProviderResult } from '../types';

/**
 * Low-level ESPN v3 client.
 *
 * `import 'server-only'` at the top makes it a build error to pull this module into a
 * client component, which is what guarantees the ESPN cookies can never reach the
 * browser. See ESPN_INTEGRATION.md for what these endpoints are and what they cannot do.
 */

export const ESPN_READ_HOST = 'https://lm-api-reads.fantasy.espn.com';

export interface EspnCredentials {
  leagueId: string;
  season: number;
  /** Private leagues only. Public leagues work without these. */
  espnS2?: string;
  swid?: string;
}

export interface EspnRequestOptions {
  views: string[];
  /** Value for the X-Fantasy-Filter header, required for >50 results. */
  filter?: Record<string, unknown>;
  scoringPeriodId?: number;
  /** Cache TTL in milliseconds. */
  cacheTtlMs?: number;
  signal?: AbortSignal;
}

/** Retries and backoff. A 401 is never retried — it means the cookies are stale. */
export const MAX_RETRIES = 3;
export const BASE_BACKOFF_MS = 1000;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function clearEspnCache(): void {
  cache.clear();
}

export function credentialsFromEnv(): EspnCredentials | null {
  const leagueId = process.env.ESPN_LEAGUE_ID;
  const season = process.env.ESPN_SEASON;
  if (!leagueId || !season) return null;
  return {
    leagueId,
    season: Number(season),
    espnS2: process.env.ESPN_S2 || undefined,
    swid: process.env.ESPN_SWID || undefined,
  };
}

/** Masked fingerprint for display. Never returns the credential itself. */
export function credentialFingerprint(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '••••';
  return `••••${trimmed.slice(-4)}`;
}

export function leagueUrl(credentials: EspnCredentials): string {
  return `${ESPN_READ_HOST}/apis/v3/games/ffl/seasons/${credentials.season}/segments/0/leagues/${credentials.leagueId}`;
}

export function playersUrl(season: number): string {
  return `${ESPN_READ_HOST}/apis/v3/games/ffl/seasons/${season}/players`;
}

/**
 * Perform a GET against the ESPN fantasy API.
 *
 * Returns a ProviderResult so callers get a typed status rather than an exception, and
 * so an auth failure is distinguishable from an empty league.
 */
export async function espnFetch<T>(
  url: string,
  credentials: EspnCredentials,
  options: EspnRequestOptions,
): Promise<ProviderResult<T>> {
  const query = new URLSearchParams();
  for (const view of options.views) query.append('view', view);
  if (options.scoringPeriodId !== undefined) {
    query.set('scoringPeriodId', String(options.scoringPeriodId));
  }

  const fullUrl = `${url}?${query.toString()}`;
  const cacheKey = `${fullUrl}::${JSON.stringify(options.filter ?? {})}`;
  const ttl = options.cacheTtlMs ?? 0;

  if (ttl > 0) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return {
        ok: true,
        data: hit.value as T,
        status: 'CONNECTED',
        source: 'espn',
        asOf: new Date(hit.expiresAt - ttl).toISOString(),
      };
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.filter) headers['X-Fantasy-Filter'] = JSON.stringify(options.filter);
  if (credentials.espnS2 && credentials.swid) {
    headers['Cookie'] = `espn_s2=${credentials.espnS2}; SWID=${normaliseSwid(credentials.swid)}`;
  }

  let lastError = 'Unknown error';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(fullUrl, {
        headers,
        signal: options.signal,
        cache: 'no-store',
      });

      if (response.ok) {
        const data = (await response.json()) as T;
        if (ttl > 0) cache.set(cacheKey, { value: data, expiresAt: Date.now() + ttl });
        return {
          ok: true,
          data,
          status: 'CONNECTED',
          source: 'espn',
          asOf: new Date().toISOString(),
        };
      }

      const status = mapHttpStatus(response.status);

      // Auth failures are terminal: retrying with the same stale cookie cannot help.
      if (status === 'AUTH_EXPIRED' || status === 'NOT_FOUND') {
        return {
          ok: false,
          data: null,
          status,
          source: 'espn',
          asOf: new Date().toISOString(),
          message: describeStatus(status, response.status),
        };
      }

      lastError = describeStatus(status, response.status);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < MAX_RETRIES) {
      const jitter = Math.random() * 250;
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt) + jitter);
    }
  }

  return {
    ok: false,
    data: null,
    status: 'UPSTREAM_ERROR',
    source: 'espn',
    asOf: new Date().toISOString(),
    message: `ESPN request failed after ${MAX_RETRIES + 1} attempts: ${lastError}`,
  };
}

export function mapHttpStatus(httpStatus: number): ConnectionStatus {
  if (httpStatus === 401 || httpStatus === 403) return 'AUTH_EXPIRED';
  if (httpStatus === 404) return 'NOT_FOUND';
  if (httpStatus === 429) return 'RATE_LIMITED';
  return 'UPSTREAM_ERROR';
}

export function describeStatus(status: ConnectionStatus, httpStatus?: number): string {
  switch (status) {
    case 'AUTH_EXPIRED':
      return 'ESPN rejected the credentials. For a private league, refresh espn_s2 and SWID (see ESPN_INTEGRATION.md).';
    case 'NOT_FOUND':
      return 'ESPN returned 404. Check the league id and season — ESPN also deletes data for some older seasons.';
    case 'RATE_LIMITED':
      return 'ESPN rate-limited the request. The client backs off automatically; try again shortly.';
    case 'NOT_CONFIGURED':
      return 'ESPN is not configured. Set ESPN_LEAGUE_ID and ESPN_SEASON, plus cookies for a private league.';
    case 'UPSTREAM_ERROR':
      return `ESPN returned an unexpected response${httpStatus ? ` (HTTP ${httpStatus})` : ''}.`;
    case 'CONNECTED':
      return 'Connected.';
  }
}

/** SWID must be wrapped in braces; users routinely paste it without them. */
export function normaliseSwid(swid: string): string {
  const trimmed = swid.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  return `{${trimmed.replace(/^\{|\}$/g, '')}}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
