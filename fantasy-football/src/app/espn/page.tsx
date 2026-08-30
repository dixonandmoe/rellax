import { EspnConnectionForm } from '@/components/espn-connection-form';
import { Card } from '@/components/ui';
import { currentSeason, hasEspnPrivateCredentials, isEspnConfigured } from '@/lib/env';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

export default async function EspnPage() {
  const loaded = await loadLeagueState();

  const configured = isEspnConfigured();
  const hasCookies = hasEspnPrivateCredentials();

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ESPN Connection</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          ESPN publishes no supported public fantasy API. This app uses the same private v3
          endpoints the ESPN site itself calls, which work well but can change without notice.
        </p>
      </div>

      <Card title="Connection status">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium ${
              loaded.status === 'CONNECTED' && configured
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
            }`}
          >
            <span aria-hidden>●</span>
            {configured
              ? loaded.status === 'CONNECTED'
                ? 'Connected'
                : loaded.status.replace('_', ' ')
              : 'Not configured'}
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            Active data provider: <strong>{loaded.mode}</strong>
            {loaded.isSample && ' (synthetic sample data)'}
          </span>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <Row
            label="League id / season"
            value={configured ? `configured (season ${currentSeason()})` : 'not set'}
          />
          <Row
            label="Private-league cookies"
            value={
              hasCookies
                ? 'espn_s2 and SWID are set on the server'
                : 'not set — only public leagues will load'
            }
          />
        </dl>

        {loaded.warnings.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-400">
            {loaded.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </Card>

      <EspnConnectionForm defaultSeason={currentSeason()} />

      <Card title="What ESPN can and cannot give us">
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold text-emerald-700 dark:text-emerald-400">Available</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600 dark:text-slate-300">
              <li>League settings: size, scoring, lineup slots, FAAB budget, playoff setup</li>
              <li>Teams, owners, records, and FAAB spent (so remaining is derivable)</li>
              <li>Rosters with lineup slots and acquisition types</li>
              <li>Draft results, matchups, scores, standings</li>
              <li>Transactions, including waiver bid amounts</li>
              <li>Free agents / waiver pool (needs the X-Fantasy-Filter header)</li>
              <li>ESPN&apos;s own projections and coarse injury status</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-rose-700 dark:text-rose-400">Not available</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600 dark:text-slate-300">
              <li>
                <strong>Any write operation.</strong> ESPN has no supported write API, so
                this app cannot submit waiver claims, set lineups, or propose trades. It
                produces the recommendation; you execute it in ESPN.
              </li>
              <li>
                <strong>A live draft feed.</strong> The draft room uses an undocumented
                websocket protocol. The Draft Assistant polls draft results instead and also
                accepts fully manual pick entry.
              </li>
              <li>
                <strong>ADP.</strong> Not a first-class field. Import ADP on the Settings page.
              </li>
              <li>
                <strong>Usage detail</strong> — snap counts, target share, red-zone touches —
                and weather. These come from separate providers that are interfaces only today.
              </li>
              <li>Data for some older seasons, which ESPN has deleted.</li>
            </ul>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            Full endpoint reference, cookie instructions and limitations are in{' '}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">ESPN_INTEGRATION.md</code>.
          </p>
        </div>
      </Card>

      <Card title="Security">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>Cookies are read from server-side environment variables only.</li>
          <li>
            The ESPN client module is marked <code>server-only</code>, so importing it into a
            client component is a build error — the credentials cannot reach the browser.
          </li>
          <li>The form below posts to a server route; only a masked fingerprint comes back.</li>
          <li>Cookies are never logged and never placed in a URL.</li>
        </ul>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
