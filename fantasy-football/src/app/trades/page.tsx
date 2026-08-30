import { buildWeeklyReport } from '@/domain/actions';
import { computeTeamNeeds, type TeamNeedsReport } from '@/domain/team-needs';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import { TradeAnalyzer } from '@/components/trade-analyzer';
import {
  Card,
  DataUnavailable,
  ExplainDetails,
  PositionBadge,
  SampleDataBanner,
  WarningList,
} from '@/components/ui';
import { formatPoints, formatSigned } from '@/lib/format';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

export default async function TradesPage() {
  const loaded = await loadLeagueState();
  const { state } = loaded;

  if (state.seasonProjections.length === 0) {
    return (
      <Card title="Trades">
        <DataUnavailable
          reason="Trade evaluation compares starting lineups before and after, which needs projections."
          lastUpdated={loaded.asOf}
        />
      </Card>
    );
  }

  const report = buildWeeklyReport(state);
  const valuation = valuePlayers(state.config, state.players, state.seasonProjections, {
    injuries: state.injuries,
  });
  const values = indexByPlayer(valuation);

  const needsByTeam = new Map<string, TeamNeedsReport>();
  for (const team of state.teams) {
    needsByTeam.set(team.id, computeTeamNeeds(state.config, team, values, valuation.players));
  }

  const myTeam = state.teams.find((t) => t.isMyTeam) ?? state.teams[0];

  const rosterOptions = state.teams.map((team) => ({
    id: team.id,
    name: team.name,
    isMyTeam: team.isMyTeam,
    players: team.roster
      .map((entry) => values.get(entry.playerId))
      .filter((v): v is NonNullable<typeof v> => Boolean(v))
      .sort((a, b) => b.projectedPoints - a.projectedPoints)
      .map((v) => ({
        id: v.player.id,
        name: v.player.name,
        position: v.player.position,
        projectedPoints: v.projectedPoints,
      })),
  }));

  return (
    <>
      {loaded.isSample && <SampleDataBanner warnings={loaded.warnings} />}
      {!loaded.isSample && <WarningList warnings={loaded.warnings} />}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trades</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Evaluated by the change in each side&apos;s optimal starting lineup — not by adding
          up player values.
        </p>
      </div>

      <TradeAnalyzer teams={rosterOptions} myTeamId={myTeam?.id ?? ''} />

      <Card
        title="Trade targets"
        subtitle="Only trades where BOTH starting lineups improve, so the other manager has a reason to accept"
      >
        {report.tradeIdeas.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No mutually beneficial trades found. That usually means no other team has surplus
            at a position you need while needing a position where you have surplus.
          </p>
        ) : (
          <ul className="space-y-4">
            {report.tradeIdeas.map((idea, index) => (
              <li
                key={`${idea.partnerTeamId}-${index}`}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <h3 className="font-semibold">{idea.partnerTeamName}</h3>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                      You receive
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {idea.receive.map((player) => (
                        <li key={player.player.id} className="flex items-center gap-2">
                          <PositionBadge position={player.player.position} />
                          {player.player.name}
                          <span className="tabular text-slate-500 dark:text-slate-400">
                            {formatPoints(player.projectedPoints)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs tracking-wide text-rose-600 uppercase dark:text-rose-400">
                      You send
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {idea.send.map((player) => (
                        <li key={player.player.id} className="flex items-center gap-2">
                          <PositionBadge position={player.player.position} />
                          {player.player.name}
                          <span className="tabular text-slate-500 dark:text-slate-400">
                            {formatPoints(player.projectedPoints)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span>
                    You: <strong className="tabular">{formatSigned(idea.myGain)}</strong> starting pts
                  </span>
                  <span>
                    Them: <strong className="tabular">{formatSigned(idea.partnerGain)}</strong> starting pts
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Fairness {Math.round(idea.fairnessScore)}/100
                  </span>
                </div>

                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {idea.reasoning.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>

                <ExplainDetails
                  formula={idea.evaluation.explain.formula}
                  inputs={idea.evaluation.explain.inputs}
                  sources={idea.evaluation.explain.sources}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Partner motivation" subtitle="What each manager is trying to do right now">
        <ul className="space-y-2 text-sm">
          {state.teams
            .filter((team) => !team.isMyTeam)
            .map((team) => {
              const needs = needsByTeam.get(team.id);
              if (!needs) return null;
              return (
                <li
                  key={team.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800/60"
                >
                  <span className="w-40 truncate font-medium">{team.name}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-slate-800">
                    {needs.tradeStance.replace('_', ' ')}
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    Needs:
                    {needs.needOrder.slice(0, 3).map((position) => (
                      <PositionBadge key={position} position={position} />
                    ))}
                  </span>
                  {needs.surplus.length > 0 && (
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      Surplus:
                      {needs.surplus.map((position) => (
                        <PositionBadge key={position} position={position} />
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
        </ul>
      </Card>
    </>
  );
}
