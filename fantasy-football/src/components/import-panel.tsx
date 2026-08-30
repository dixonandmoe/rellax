'use client';

import { useState } from 'react';

interface ImportResult {
  playerCount: number;
  projectionCount: number;
  adpCount: number;
  recognisedColumns: string[];
  ignoredColumns: string[];
  errors: Array<{ line: number; message: string }>;
  preview: Array<{
    id: string;
    name: string;
    position: string;
    nflTeam: string | null;
    byeWeek: number | null;
    hasProjection: boolean;
    adp: number | null;
  }>;
}

const SAMPLE_CSV = `Player,Pos,Team,Bye,ADP,PassYds,PassTD,INT,RushYds,RushTD,Rec,RecYds,RecTD
Example QB,QB,KC,10,14,4250,31,9,290,3,,,
Example RB,RB,SF,9,8,,,,1180,11,52,410,2
Example WR,WR,MIN,6,5,,,,15,0,104,1420,9`;

/**
 * Manual import.
 *
 * The app must work with no ESPN connection at all, so this is a first-class path. The
 * preview shows exactly which columns were understood and which rows failed, rather than
 * importing a partially-parsed file silently.
 */
export function ImportPanel({ season }: { season: number }) {
  const [content, setContent] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, season, source: 'manual-import' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Import failed.');
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setContent(await file.text());
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Manual import</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Paste or upload CSV or JSON with players, projections and ADP. Works with no ESPN
          connection.
        </p>
      </header>

      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,.json,.txt,text/csv,application/json"
            onChange={(event) => onFile(event.target.files?.[0])}
            className="text-sm"
          />
          <button
            type="button"
            onClick={() => setContent(SAMPLE_CSV)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Load example format
          </button>
        </div>

        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={8}
          spellCheck={false}
          placeholder="Player,Pos,Team,Bye,ADP,PassYds,PassTD,…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
        />

        <button
          type="button"
          onClick={submit}
          disabled={loading || content.trim().length === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {loading ? 'Parsing…' : 'Validate import'}
        </button>

        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        {result && (
          <div className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
            <p className="font-medium">
              {result.playerCount} players · {result.projectionCount} with projections ·{' '}
              {result.adpCount} with ADP
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Recognised columns: {result.recognisedColumns.join(', ') || 'none'}
              {result.ignoredColumns.length > 0 &&
                ` · ignored: ${result.ignoredColumns.join(', ')}`}
            </p>

            {result.errors.length > 0 && (
              <div className="mt-3">
                <p className="font-medium text-rose-600 dark:text-rose-400">
                  {result.errors.length} row(s) could not be imported
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-rose-600 dark:text-rose-400">
                  {result.errors.slice(0, 10).map((rowError) => (
                    <li key={`${rowError.line}-${rowError.message}`}>
                      Line {rowError.line}: {rowError.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.preview.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-1 pr-3">Player</th>
                      <th className="py-1 pr-3">Pos</th>
                      <th className="py-1 pr-3">Team</th>
                      <th className="py-1 pr-3">Bye</th>
                      <th className="py-1 pr-3">Projection</th>
                      <th className="py-1">ADP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/60">
                        <td className="py-1 pr-3">{row.name}</td>
                        <td className="py-1 pr-3">{row.position}</td>
                        <td className="py-1 pr-3">{row.nflTeam ?? '—'}</td>
                        <td className="py-1 pr-3">{row.byeWeek ?? '—'}</td>
                        <td className="py-1 pr-3">{row.hasProjection ? 'yes' : 'no'}</td>
                        <td className="py-1">{row.adp ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              This is a validation preview. Persisting an import requires a configured
              database (DATABASE_URL) — see PROJECT_PLAN.md for what is and is not wired up yet.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
