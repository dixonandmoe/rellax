import { analyzePlayoffs } from '@/domain/playoffs';
import { computePowerRankings, simulateSeason } from '@/domain/power-rankings';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import {
  Card,
  DataUnavailable,
  PositionBadge,
  SampleDataBanner,
  Stat,
  WarningList,
} from '@/components/ui';
import { formatPercent, formatPoints, ordinal } from '@/lib/format';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

export default async function PlayoffsPage() {
  const loaded = await loadLeagueState();
  const { state } = loaded;
  const myTeam = state.teams.find((t) => t.isMyTeam) ?? state.teams[0];

  if (!myTeam || state.seasonProjections.length === 0) {
    return (
      <Card title="Playoffs">
        <DataUnavailable
          reason="Playoff analysis needs a roster and projections."
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
  const strengthByTeam = new Map(rankings.map((r) => [r.teamId, r.grade.starterStrength]));

  const analysis = analyzePlayoffs(state.config, myTeam, values, state.weeklyProjections, {
    matchups: state.matchups,
    opponentStrength: strengthByTeam,
  });

  const weeklyByTeam = new Map(rankings.map((r) => [r.teamId, r.grade.weeklyProjection]));
  const simulation = simulateSeason(state.config, state.teams, weeklyByTeam, state.matchups, {
    currentWeek: state.currentWeek,
  });
  const mySim = simulation.find((s) => s.teamId === myTeam.id);

  return (
    <>
      {loaded.isSample && <SampleDataBanner warnings={loaded.warnings} />}
      {!loaded.isSample && <WarningList warnings={loaded.warnings} />}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Playoffs</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Weeks {state.config.playoffWeeks.join(', ')} · top {state.config.playoffTeams} of{' '}
          {state.config.teamCount} qualify
        </p>
      </div>

      <Card title="Your playoff odds" subtitle="Modelled over 2,000 simulated seasons">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Playoff odds"
            value={mySim ? formatPercent(mySim.playoffOdds) : '—'}
            emphasis
          />
          <Stat
            label="Championship odds"
            value={mySim ? formatPercent(mySim.championshipOdds) : '—'}
            emphasis
          />
          <Stat
            label="Projected finish"
            value={mySim ? ordinal(mySim.projectedFinish) : '—'}
            emphasis
          />
          <Stat
            label="Projected wins"
            value={mySim ? formatPoints(mySim.projectedWins) : '—'}
            emphasis
          />
        </dl>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          These are model outputs from a normal-variance simulation over the remaining
          schedule, not a projection supplied by any data provider.
        </p>
      </Card>

      <Card
        title="Playoff schedule outlook"
        subtitle={
          analysis.playoffScheduleDifficulty !== null
            ? `Average opponent strength in playoff weeks: ${Math.round(analysis.playoffScheduleDifficulty)}/100`
            : undefined
        }
      >
        {!analysis.dataAvailable ? (
          <DataUnavailable
            reason={analysis.unavailableReason ?? 'Weekly projections are required.'}
            lastUpdated={loaded.asOf}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                Buy before the playoffs
              </h3>
              {analysis.buyTargets.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nobody on your roster has a materially better playoff schedule.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {analysis.buyTargets.map((outlook) => (
                    <li key={outlook.playerId}>
                      <span className="flex items-center gap-2 font-medium">
                        <PositionBadge position={outlook.position} />
                        {outlook.playerName}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">{outlook.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-rose-600 uppercase dark:text-rose-400">
                Sell before the playoffs
              </h3>
              {analysis.sellCandidates.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nobody on your roster has a materially worse playoff schedule.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {analysis.sellCandidates.map((outlook) => (
                    <li key={outlook.playerId}>
                      <span className="flex items-center gap-2 font-medium">
                        <PositionBadge position={outlook.position} />
                        {outlook.playerName}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">{outlook.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="League playoff picture">
        <ul className="space-y-2 text-sm">
          {simulation
            .slice()
            .sort((a, b) => b.playoffOdds - a.playoffOdds)
            .map((entry) => {
              const team = state.teams.find((t) => t.id === entry.teamId);
              return (
                <li key={entry.teamId} className="flex items-center gap-3">
                  <span className={`w-40 truncate ${team?.isMyTeam ? 'font-semibold' : ''}`}>
                    {team?.name ?? entry.teamId}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-slate-900 dark:bg-slate-100"
                      style={{ width: `${entry.playoffOdds * 100}%` }}
                    />
                  </div>
                  <span className="tabular w-14 text-right">{formatPercent(entry.playoffOdds)}</span>
                  <span className="tabular w-14 text-right text-slate-500 dark:text-slate-400">
                    {formatPercent(entry.championshipOdds)}
                  </span>
                </li>
              );
            })}
        </ul>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Columns: playoff odds, championship odds.
        </p>
      </Card>
    </>
  );
}
