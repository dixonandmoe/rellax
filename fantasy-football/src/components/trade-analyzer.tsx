'use client';

import { useState } from 'react';
import { PositionBadge } from '@/components/ui';

interface TeamOption {
  id: string;
  name: string;
  isMyTeam: boolean;
  players: Array<{ id: string; name: string; position: string; projectedPoints: number }>;
}

interface SideEvaluation {
  teamName: string;
  starterPointsBefore: number;
  starterPointsAfter: number;
  starterDelta: number;
  starterDeltaPct: number;
  benchDelta: number;
  strengthened: string[];
  weakened: string[];
  createsHole: string[];
}

interface Evaluation {
  verdict: 'ACCEPT' | 'REJECT' | 'NEGOTIATE';
  winner: 'PROPOSER' | 'RECEIVER' | 'EVEN';
  realistic: boolean;
  reasoning: string[];
  sides: [SideEvaluation, SideEvaluation];
  explain: { formula: string; sources: string[] };
}

/**
 * Trade analyzer.
 *
 * Pick what you receive and what you send; the evaluation runs server-side against the
 * live league state so the client never has to hold the projection set.
 */
export function TradeAnalyzer({ teams, myTeamId }: { teams: TeamOption[]; myTeamId: string }) {
  const [partnerId, setPartnerId] = useState(
    teams.find((team) => team.id !== myTeamId)?.id ?? '',
  );
  const [send, setSend] = useState<string[]>([]);
  const [receive, setReceive] = useState<string[]>([]);
  const [result, setResult] = useState<Evaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const myTeam = teams.find((team) => team.id === myTeamId);
  const partner = teams.find((team) => team.id === partnerId);

  const toggle = (list: string[], setList: (value: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  const evaluate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposingTeamId: myTeamId,
          receivingTeamId: partnerId,
          sendPlayerIds: send,
          receivePlayerIds: receive,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Trade evaluation failed.');
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Trade evaluation failed.');
    } finally {
      setLoading(false);
    }
  };

  const verdictClass =
    result?.verdict === 'ACCEPT'
      ? 'text-emerald-600 dark:text-emerald-400'
      : result?.verdict === 'REJECT'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-amber-600 dark:text-amber-400';

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Trade Analyzer</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Select players from both rosters to evaluate a hypothetical trade.
        </p>
      </header>

      <div className="px-5 py-4">
        <label className="block text-sm">
          <span className="font-medium">Trade partner</span>
          <select
            value={partnerId}
            onChange={(event) => {
              setPartnerId(event.target.value);
              setReceive([]);
              setResult(null);
            }}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            {teams
              .filter((team) => team.id !== myTeamId)
              .map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
          </select>
        </label>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
              You receive from {partner?.name ?? '—'}
            </h3>
            <PlayerPicker
              players={partner?.players ?? []}
              selected={receive}
              onToggle={(id) => toggle(receive, setReceive, id)}
            />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-rose-600 uppercase dark:text-rose-400">
              You send from {myTeam?.name ?? '—'}
            </h3>
            <PlayerPicker
              players={myTeam?.players ?? []}
              selected={send}
              onToggle={(id) => toggle(send, setSend, id)}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={evaluate}
          disabled={loading || send.length === 0 || receive.length === 0}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {loading ? 'Evaluating…' : 'Evaluate trade'}
        </button>

        {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        {result && (
          <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-lg font-bold">
                Verdict: <span className={verdictClass}>{result.verdict}</span>
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Winner: {result.winner === 'PROPOSER' ? 'you' : result.winner === 'RECEIVER' ? partner?.name : 'even'}
                {!result.realistic && ' · unrealistic as offered'}
              </p>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {result.sides.map((side) => (
                <div
                  key={side.teamName}
                  className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950/60"
                >
                  <p className="font-semibold">{side.teamName}</p>
                  <p className="tabular mt-1">
                    Starters {side.starterPointsBefore.toFixed(1)} →{' '}
                    {side.starterPointsAfter.toFixed(1)} (
                    {side.starterDelta >= 0 ? '+' : ''}
                    {side.starterDeltaPct.toFixed(1)}%)
                  </p>
                  {side.strengthened.length > 0 && (
                    <p className="mt-1 text-emerald-600 dark:text-emerald-400">
                      Stronger at {side.strengthened.join(', ')}
                    </p>
                  )}
                  {side.weakened.length > 0 && (
                    <p className="text-rose-600 dark:text-rose-400">
                      Thinner at {side.weakened.join(', ')}
                    </p>
                  )}
                  {side.createsHole.length > 0 && (
                    <p className="mt-1 font-medium text-rose-600 dark:text-rose-400">
                      ⚠️ Cannot fill {side.createsHole.join(', ')} afterwards
                    </p>
                  )}
                </div>
              ))}
            </div>

            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
              {result.reasoning.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>

            <p className="mt-3 font-mono text-xs text-slate-500 dark:text-slate-400">
              {result.explain.formula}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function PlayerPicker({
  players,
  selected,
  onToggle,
}: {
  players: TeamOption['players'];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (players.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No rostered players.</p>;
  }

  return (
    <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800">
      {players.map((player) => (
        <li key={player.id}>
          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
            <input
              type="checkbox"
              checked={selected.includes(player.id)}
              onChange={() => onToggle(player.id)}
              className="rounded border-slate-300 dark:border-slate-600"
            />
            <PositionBadge position={player.position} />
            <span className="flex-1 truncate">{player.name}</span>
            <span className="tabular text-xs text-slate-500 dark:text-slate-400">
              {player.projectedPoints.toFixed(0)}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
