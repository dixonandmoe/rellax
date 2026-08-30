/**
 * Environment access.
 *
 * Nothing here is exported to the browser. Anything the client needs is passed down as
 * props from a server component, already masked.
 */

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function isEspnConfigured(): boolean {
  return Boolean(process.env.ESPN_LEAGUE_ID && process.env.ESPN_SEASON);
}

export function hasEspnPrivateCredentials(): boolean {
  return Boolean(process.env.ESPN_S2 && process.env.ESPN_SWID);
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function currentSeason(): number {
  const configured = process.env.ESPN_SEASON;
  return configured ? Number(configured) : new Date().getFullYear();
}
