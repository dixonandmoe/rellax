import { buildWeeklyReport } from '@/domain/actions';
import { computePowerRankings, simulateSeason } from '@/domain/power-rankings';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import { describeScoring } from '@/ai/analysis-service';
import { WhatShouldIDo } from '@/components/what-should-i-do';
import {
  Card,
  DataUnavailable,
  ExplainDetails,
  GradePill,
  SampleDataBanner,
  Stat,
  WarningList,
} from '@/components/ui';
import { formatPercent, formatPoints, gradeColor, ordinal } from '@/lib/format';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const loaded = await loadLeagueState();
  const { state } = loaded;
  const report = buildWeeklyReport(state);
  const myTeam = state.teams.find((t) => t.isMyTeam) ?? state.teams[0];

  if (!myTeam) {
    return (
      <Card title="My Team">
        <DataUnavailable
          reason="No teams are loaded. Connect your ESPN league or import a roster."
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
  const myRanking = rankings.find((r) => r.teamId === myTeam.id);

  const weeklyByTeam = new Map(
    rankings.map((r) => [r.teamId, r.grade.weeklyProjection]),
  );
  const simulation = simulateSeason(state.config, state.teams, weeklyByTeam, state.matchups, {
    currentWeek: state.currentWeek,
  });
  const mySim = simulation.find((s) => s.teamId === myTeam.id);

  const grade = report.grade;
  const hasProjections = state.seasonProjections.length > 0;

  return (
    <>
      {loaded.isSample && <SampleDataBanner warnings={loaded.warnings} />}
      {!loaded.isSample && <WarningList warnings={[...loaded.warnings, ...report.dataWarnings]} />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{myTeam.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {state.config.name} · {state.config.teamCount} teams ·{' '}
            {describeScoring(state.config)} · {state.config.waiverType} waivers
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Overall
          </p>
          <GradePill grade={grade.overallGrade} size="lg" />
        </div>
      </div>

      <WhatShouldIDo initialActions={report.actions.slice(0, 3)} />

      {!hasProjections ? (
        <Card title="Team Overview">
          <DataUnavailable
            reason="No projections are loaded, so team grades, projections and rankings cannot be computed. Import projections or connect a projection provider."
            lastUpdated={loaded.asOf}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Team Overview">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Stat
                  label="Projected points"
                  value={formatPoints(grade.projectedPoints)}
                  hint="Season total, optimal lineup"
                  emphasis
                />
                <Stat
                  label="Weekly projection"
                  value={formatPoints(grade.weeklyProjection)}
                  hint={`Floor ${formatPoints(grade.floorProjection)} · Ceiling ${formatPoints(grade.ceilingProjection)}`}
                  emphasis
                />
                <Stat
                  label="Projected finish"
                  value={mySim ? ordinal(mySim.projectedFinish) : '—'}
                  hint={mySim ? `${formatPoints(mySim.projectedWins)} projected wins` : undefined}
                  emphasis
                />
                <Stat label="Depth score" value={`${Math.round(grade.depthScore)}/100`} />
                <Stat label="Starter strength" value={`${Math.round(grade.starterStrength)}/100`} />
                <Stat label="Playoff strength" value={`${Math.round(grade.playoffStrength)}/100`} />
                <Stat
                  label="Championship odds"
                  value={mySim ? formatPercent(mySim.championshipOdds) : '—'}
                  hint="Modelled, 2,000 simulations"
                />
                <Stat label="Injury risk" value={`${Math.round(grade.injuryRisk)}/100`} />
                <Stat label="Bye-week risk" value={`${Math.round(grade.byeRisk)}/100`} />
              </dl>
              <ExplainDetails
                formula={grade.explain.formula}
                inputs={grade.explain.inputs}
                sources={grade.explain.sources}
              />
            </Card>

            <Card title="Positional Grades" subtitle="Relative to the other teams in this league">
              <ul className="space-y-2">
                {grade.positionGrades.map((position) => (
                  <li key={position.position} className="flex items-center gap-3">
                    <span className="w-12 text-sm font-medium">{position.position}</span>
                    <span className={`w-10 text-lg font-bold ${gradeColor(position.grade)}`}>
                      {position.grade}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-slate-900 dark:bg-slate-100"
                        style={{ width: `${position.score}%` }}
                      />
                    </div>
                    <span className="tabular w-20 text-right text-xs text-slate-500 dark:text-slate-400">
                      {ordinal(position.leagueRank)} of {state.config.teamCount}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Biggest Strengths">
              {grade.strengths.length > 0 ? (
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
                  {grade.strengths.map((strength) => (
                    <li key={strength}>{strength}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No position grades out clearly above the league — this roster is balanced
                  rather than top-heavy.
                </p>
              )}
            </Card>

            <Card title="Biggest Weaknesses">
              {grade.weaknesses.length > 0 ? (
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
                  {grade.weaknesses.map((weakness) => (
                    <li key={weakness}>{weakness}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No position grades out clearly below the league.
                </p>
              )}
            </Card>
          </div>

          <Card
            title="Where you stand"
            subtitle={
              myRanking
                ? `${ordinal(myRanking.rank)} of ${state.config.teamCount} in the power rankings`
                : undefined
            }
          >
            {myRanking ? (
              <>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {myRanking.explanation}
                </p>
                <ExplainDetails
                  formula={myRanking.explain.formula}
                  inputs={myRanking.explain.inputs}
                  sources={myRanking.explain.sources}
                />
              </>
            ) : (
              <DataUnavailable reason="Power rankings could not be computed." lastUpdated={loaded.asOf} />
            )}
          </Card>
        </>
      )}
    </>
  );
}
