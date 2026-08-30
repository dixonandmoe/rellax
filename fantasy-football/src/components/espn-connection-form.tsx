'use client';

import { useState } from 'react';

interface TestResult {
  ok: boolean;
  status: string;
  message: string;
  credentials: {
    leagueId: string;
    season: number;
    espnS2: string | null;
    swid: string | null;
    privateLeagueCredentialsProvided: boolean;
  };
  league: {
    name: string;
    teamCount: number;
    lineup: Record<string, number>;
    waiverType: string;
    faabBudget: number;
    receptionPoints: number;
  } | null;
}

/**
 * ESPN connection form.
 *
 * Credentials are posted to a server route and never stored in client state beyond the
 * life of the form. The response contains only a masked fingerprint, so nothing sensitive
 * is rendered back into the page.
 */
export function EspnConnectionForm({ defaultSeason }: { defaultSeason: number }) {
  const [leagueId, setLeagueId] = useState('');
  const [season, setSeason] = useState(String(defaultSeason));
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const test = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/espn/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagueId: leagueId.trim(),
          season: Number(season),
          espnS2: espnS2.trim() || undefined,
          swid: swid.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Connection test failed.');
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Connection test failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Test a connection</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Verify credentials before adding them to your server environment. Nothing entered
          here is persisted.
        </p>
      </header>

      <div className="space-y-4 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="League ID" value={leagueId} onChange={setLeagueId} placeholder="123456" />
          <Field label="Season" value={season} onChange={setSeason} placeholder="2026" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="espn_s2 (private leagues only)"
            value={espnS2}
            onChange={setEspnS2}
            placeholder="AEB…"
            secret
          />
          <Field
            label="SWID (private leagues only)"
            value={swid}
            onChange={setSwid}
            placeholder="{XXXXXXXX-XXXX-…}"
            secret
          />
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Get these from espn.com → DevTools → Application → Cookies. Public leagues need
          neither. Braces around SWID are added automatically if you leave them off.
        </p>

        <button
          type="button"
          onClick={test}
          disabled={loading || leagueId.trim().length === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {loading ? 'Testing…' : 'Connect ESPN league'}
        </button>

        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        {result && (
          <div
            className={`rounded-lg border p-4 text-sm ${
              result.ok
                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
            }`}
          >
            <p className="font-semibold">
              {result.ok ? '● Connected' : `● ${result.status.replace('_', ' ')}`}
            </p>
            <p className="mt-1">{result.message}</p>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Credentials used: league {result.credentials.leagueId}, season{' '}
              {result.credentials.season}
              {result.credentials.privateLeagueCredentialsProvided
                ? `, espn_s2 ${result.credentials.espnS2}, SWID ${result.credentials.swid}`
                : ', no cookies (public league mode)'}
            </p>

            {result.league && (
              <dl className="mt-3 space-y-1">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">League</dt>
                  <dd className="font-medium">{result.league.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Teams</dt>
                  <dd className="font-medium">{result.league.teamCount}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Starting QBs</dt>
                  <dd className="font-medium">{result.league.lineup.QB}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Points per reception</dt>
                  <dd className="font-medium">{result.league.receptionPoints}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Waivers</dt>
                  <dd className="font-medium">
                    {result.league.waiverType} (${result.league.faabBudget})
                  </dd>
                </div>
              </dl>
            )}

            {result.ok && (
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                To use this league, set ESPN_LEAGUE_ID, ESPN_SEASON and (for a private
                league) ESPN_S2 and ESPN_SWID in your server environment, then restart.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
      />
    </label>
  );
}
