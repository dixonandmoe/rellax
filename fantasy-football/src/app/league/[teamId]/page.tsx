import { notFound } from 'next/navigation';
import { optimalLineup } from '@/domain/lineup';
import { computePowerRankings } from '@/domain/power-rankings';
import { computeTeamNeeds } from '@/domain/team-needs';
import { gradeTeam } from '@/domain/team-grade';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import {
  Card,
  DataUnavailable,
  ExplainDetails,
  GradePill,
  PositionBadge,
  SampleDataBanner,
  Stat,
} from '@/components/ui';
import { formatMoney, formatPoints, gradeColor, ordinal } from '@/lib/format';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const loaded = await loadLeagueState();
  const { state } = loaded;

  const team = state.teams.find((t) => t.id === decodeURIComponent(teamId));
  if (!team) notFound();

  if (state.seasonProjections.length === 0) {
    return (
      <Card title={team.name}>
        <DataUnavailable
          reason="Team analysis needs projections, which are not loaded."
          lastUpdated={loaded.asOf}
        />
      </Card>
    );
  }

  const valuation = valuePlayers(state.config, state.players, state.seasonProjections, {
    injuries: state.injuries,
  });
  const values = indexByPlayer(valuation);
  const grade = gradeTeam(state.config, team, state.teams, values, valuation.players);
  const needs = computeTeamNeeds(state.config, team, values, valuation.players);
  const lineup = optimalLineup(state.config, team.roster, values);
  const rankings = computePowerRankings(state.config, state.teams, values, valuation.players, {
    currentWeek: state.currentWeek,
    matchups: state.matchups,
  });
  const ranking = rankings.find((r) => r.teamId === team.id);

  const benchPlayers = lineup.benchPlayerIds
    .map((id) => values.get(id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  return (
    <>
      {loaded.isSample && <SampleDataBanner warnings={loaded.warnings} />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {team.ownerName ? `${team.ownerName} · ` : ''}
            {team.wins}-{team.losses}
            {team.ties ? `-${team.ties}` : ''}
            {ranking ? ` · ${ordinal(ranking.rank)} in power rankings` : ''}
          </p>
        </div>
        <GradePill grade={grade.overallGrade} size="lg" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Starting Lineup" subtitle={`Projected ${formatPoints(lineup.startersPoints)} pts`}>
          <ul className="space-y-1.5 text-sm">
            {lineup.assignments.map((assignment, index) => {
              const player = assignment.playerId ? values.get(assignment.playerId) : null;
              return (
                <li
                  key={`${assignment.slot}-${index}`}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800/60"
                >
                  <span className="w-20 text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    {assignment.slot}
                  </span>
                  {player ? (
                    <>
                      <span className="flex flex-1 items-center gap-2">
                        <PositionBadge position={player.player.position} />
                        {player.player.name}
                        {player.player.status !== 'ACTIVE' && (
                          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-xs text-rose-600 dark:text-rose-400">
                            {player.player.status}
                          </span>
                        )}
                      </span>
                      <span className="tabular font-medium">
                        {formatPoints(player.projectedPoints)}
                      </span>
                    </>
                  ) : (
                    <span className="flex-1 text-slate-400 italic">
                      Cannot be filled from this roster
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card title="Positional Grades">
            <ul className="space-y-2">
              {grade.positionGrades.map((position) => (
                <li key={position.position} className="flex items-center gap-3 text-sm">
                  <span className="w-10 font-medium">{position.position}</span>
                  <span className={`w-8 font-bold ${gradeColor(position.grade)}`}>
                    {position.grade}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-slate-900 dark:bg-slate-100"
                      style={{ width: `${position.score}%` }}
                    />
                  </div>
                  <span className="tabular w-16 text-right text-xs text-slate-500 dark:text-slate-400">
                    {ordinal(position.leagueRank)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Team Overview">
            <dl className="grid grid-cols-2 gap-4">
              <Stat label="Projected points" value={formatPoints(grade.projectedPoints)} />
              <Stat label="FAAB remaining" value={formatMoney(team.faabRemaining)} />
              <Stat label="Depth" value={`${Math.round(grade.depthScore)}/100`} />
              <Stat label="Injury risk" value={`${Math.round(grade.injuryRisk)}/100`} />
            </dl>
            <ExplainDetails
              formula={grade.explain.formula}
              inputs={grade.explain.inputs}
              sources={grade.explain.sources}
            />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Strengths">
          {grade.strengths.length > 0 ? (
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {grade.strengths.map((strength) => (
                <li key={strength}>{strength}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No standout strengths.</p>
          )}
        </Card>

        <Card title="Weaknesses">
          {grade.weaknesses.length > 0 ? (
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {grade.weaknesses.map((weakness) => (
                <li key={weakness}>{weakness}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No glaring weaknesses.</p>
          )}
        </Card>

        <Card title="Team Needs" subtitle={`Trade stance: ${needs.tradeStance.replace('_', ' ')}`}>
          <ol className="space-y-1.5 text-sm">
            {needs.needOrder.map((position, index) => (
              <li key={position} className="flex items-center gap-2">
                <span className="w-5 text-slate-400">{index + 1}.</span>
                <PositionBadge position={position} />
                <span className="tabular text-slate-500 dark:text-slate-400">
                  {Math.round((needs.needByPosition[position] ?? 0) * 100)}%
                </span>
              </li>
            ))}
          </ol>
          {needs.surplus.length > 0 && (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Surplus at {needs.surplus.join(', ')} — likely trade chips.
            </p>
          )}
          <ExplainDetails
            formula={needs.explain.formula}
            inputs={needs.explain.inputs}
            sources={needs.explain.sources}
          />
        </Card>
      </div>

      <Card title="Bench" subtitle={`${formatPoints(lineup.benchPoints)} projected points`}>
        {benchPlayers.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No bench players.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {benchPlayers.map((player) => (
              <li key={player.player.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <PositionBadge position={player.player.position} />
                  {player.player.name}
                </span>
                <span className="tabular">{formatPoints(player.projectedPoints)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
