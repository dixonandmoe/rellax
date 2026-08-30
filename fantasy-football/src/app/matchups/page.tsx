import { analyzeMatchup } from '@/domain/matchup';
import { buildWeeklyReport } from '@/domain/actions';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import { ActionList } from '@/components/action-list';
import {
  Card,
  DataUnavailable,
  ExplainDetails,
  PositionBadge,
  SampleDataBanner,
  Stat,
  WarningList,
} from '@/components/ui';
import { formatPercent, formatPoints, formatSigned } from '@/lib/format';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

export default async function MatchupsPage() {
  const loaded = await loadLeagueState();
  const { state } = loaded;

  if (state.seasonProjections.length === 0) {
    return (
      <Card title="Matchups">
        <DataUnavailable
          reason="Matchup analysis needs projections to compare lineups."
          lastUpdated={loaded.asOf}
        />
      </Card>
    );
  }

  const report = buildWeeklyReport(state);
  const myTeam = state.teams.find((t) => t.isMyTeam) ?? state.teams[0];
  const week = Math.max(1, report.week);

  const valuation = valuePlayers(state.config, state.players, state.seasonProjections, {
    injuries: state.injuries,
  });
  const values = indexByPlayer(valuation);

  const myMatchup = myTeam
    ? state.matchups.find(
        (m) => m.week === week && (m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id),
      )
    : undefined;
  const opponentId = myMatchup
    ? myMatchup.homeTeamId === myTeam?.id
      ? myMatchup.awayTeamId
      : myMatchup.homeTeamId
    : undefined;
  const opponent = state.teams.find((t) => t.id === opponentId);

  const analysis =
    myTeam && opponent ? analyzeMatchup(state.config, week, myTeam, opponent, values) : null;

  return (
    <>
      {loaded.isSample && <SampleDataBanner warnings={loaded.warnings} />}
      {!loaded.isSample && <WarningList warnings={[...loaded.warnings, ...report.dataWarnings]} />}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Week {week}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Matchup analysis and this week&apos;s recommended actions.
        </p>
      </div>

      {analysis && opponent ? (
        <Card title={`${myTeam!.name} vs ${opponent.name}`}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="You project" value={formatPoints(analysis.myProjection)} emphasis />
            <Stat
              label={`${opponent.name} projects`}
              value={formatPoints(analysis.opponentProjection)}
              emphasis
            />
            <Stat label="Win probability" value={formatPercent(analysis.winProbability)} emphasis />
            <Stat
              label="Margin"
              value={formatSigned(analysis.myProjection - analysis.opponentProjection)}
              emphasis
            />
          </dl>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold tracking-wide uppercase">Positional edges</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {analysis.edges.map((edge) => (
                  <li key={edge.position} className="flex items-center gap-3">
                    <PositionBadge position={edge.position} />
                    <span className="tabular w-14 text-right">{formatPoints(edge.myPoints)}</span>
                    <span className="text-slate-400">vs</span>
                    <span className="tabular w-14">{formatPoints(edge.opponentPoints)}</span>
                    <span
                      className={`tabular ml-auto font-medium ${
                        edge.edge >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatSigned(edge.edge)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3 text-sm">
              {analysis.biggestAdvantage && (
                <p>
                  <span className="font-semibold">Biggest advantage:</span>{' '}
                  {analysis.biggestAdvantage.position} (
                  {formatSigned(analysis.biggestAdvantage.edge)} pts)
                </p>
              )}
              {analysis.biggestDisadvantage && (
                <p>
                  <span className="font-semibold">Biggest disadvantage:</span>{' '}
                  {analysis.biggestDisadvantage.position} (
                  {formatSigned(analysis.biggestDisadvantage.edge)} pts)
                </p>
              )}
              <div>
                <p className="font-semibold">Key players</p>
                <ul className="mt-1 space-y-1">
                  {analysis.keyPlayerIds.map((id) => {
                    const player = values.get(id);
                    return player ? (
                      <li key={id} className="flex items-center gap-2">
                        <PositionBadge position={player.player.position} />
                        {player.player.name}
                      </li>
                    ) : null;
                  })}
                </ul>
              </div>
              {analysis.volatilePlayerIds.length > 0 && (
                <div>
                  <p className="font-semibold">Volatile / risky starters</p>
                  <ul className="mt-1 space-y-1 text-slate-600 dark:text-slate-300">
                    {analysis.volatilePlayerIds.map((id) => {
                      const player = values.get(id);
                      return player ? <li key={id}>{player.player.name}</li> : null;
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <ExplainDetails
            formula={analysis.explain.formula}
            inputs={analysis.explain.inputs}
            sources={analysis.explain.sources}
          />
        </Card>
      ) : (
        <Card title="This week's matchup">
          <DataUnavailable
            reason="No schedule is loaded for this week, so there is no opponent to analyse. Connect ESPN or import a schedule."
            lastUpdated={loaded.asOf}
          />
        </Card>
      )}

      <Card title="Lineup changes" subtitle="Free points available from your current bench">
        {report.lineupChanges.filter((c) => c.gain > 0).length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your lineup already matches the optimal one. Nothing to change.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {report.lineupChanges
              .filter((change) => change.gain > 0)
              .map((change) => {
                const start = values.get(change.startPlayerId);
                const bench = values.get(change.benchPlayerId);
                return (
                  <li key={change.startPlayerId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Start {start?.player.name ?? 'a bench player'}</span>
                    <span className="text-slate-400">over</span>
                    <span>{bench?.player.name ?? 'a current starter'}</span>
                    <span className="tabular ml-auto font-medium text-emerald-600 dark:text-emerald-400">
                      {formatSigned(change.gain)} pts
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      <Card title={`Week ${week} — what should I do?`}>
        <ActionList actions={report.actions} />
      </Card>
    </>
  );
}
