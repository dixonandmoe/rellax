import Link from 'next/link';
import { computePowerRankings } from '@/domain/power-rankings';
import { computeTeamNeeds, type TeamNeedsReport } from '@/domain/team-needs';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import {
  Card,
  DataUnavailable,
  ExplainDetails,
  PositionBadge,
  SampleDataBanner,
  WarningList,
} from '@/components/ui';
import { formatPoints, gradeColor } from '@/lib/format';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

export default async function LeaguePage() {
  const loaded = await loadLeagueState();
  const { state } = loaded;

  if (state.seasonProjections.length === 0) {
    return (
      <Card title="League Power Rankings">
        <DataUnavailable
          reason="Power rankings are computed from projections, which are not loaded."
          lastUpdated={loaded.asOf}
        />
      </Card>
    );
  }

  const valuation = valuePlayers(state.config, state.players, state.seasonProjections, {
    injuries: state.injuries,
  });
  const values = indexByPlayer(valuation);
  const rankings = computePowerRankings(state.config, state.teams, values, valuation.players, {
    currentWeek: state.currentWeek,
    matchups: state.matchups,
  });

  const needsByTeam = new Map<string, TeamNeedsReport>();
  for (const team of state.teams) {
    needsByTeam.set(team.id, computeTeamNeeds(state.config, team, values, valuation.players));
  }

  return (
    <>
      {loaded.isSample && <SampleDataBanner warnings={loaded.warnings} />}
      {!loaded.isSample && <WarningList warnings={loaded.warnings} />}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">League Power Rankings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ranked by roster strength, positional advantage, depth and schedule — not by record.
        </p>
      </div>

      <Card>
        <ol className="space-y-3">
          {rankings.map((ranking) => {
            const needs = needsByTeam.get(ranking.teamId);
            const isMine = state.teams.find((t) => t.id === ranking.teamId)?.isMyTeam;
            return (
              <li
                key={ranking.teamId}
                className={`rounded-lg border p-4 ${
                  isMine
                    ? 'border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-950'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="flex items-baseline gap-2 font-semibold">
                    <span className="tabular text-slate-400">{ranking.rank}.</span>
                    <Link href={`/league/${ranking.teamId}`} className="hover:underline">
                      {ranking.teamName}
                    </Link>
                    {isMine && (
                      <span className="rounded bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900">
                        You
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold ${gradeColor(ranking.grade.overallGrade)}`}>
                      {ranking.grade.overallGrade}
                    </span>
                    <span className="tabular text-lg font-semibold">{ranking.score}</span>
                  </div>
                </div>

                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                  {ranking.explanation}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>Record {ranking.record}</span>
                  <span>Projected {formatPoints(ranking.grade.projectedPoints)} pts</span>
                  {needs && (
                    <span className="flex items-center gap-1.5">
                      Needs:
                      {needs.needOrder.slice(0, 3).map((position) => (
                        <PositionBadge key={position} position={position} />
                      ))}
                    </span>
                  )}
                  {needs && needs.surplus.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      Surplus:
                      {needs.surplus.map((position) => (
                        <PositionBadge key={position} position={position} />
                      ))}
                    </span>
                  )}
                  {needs && <span>Stance: {needs.tradeStance.replace('_', ' ')}</span>}
                </div>

                <ExplainDetails
                  formula={ranking.explain.formula}
                  inputs={ranking.explain.inputs}
                  sources={ranking.explain.sources}
                />
              </li>
            );
          })}
        </ol>
      </Card>
    </>
  );
}
