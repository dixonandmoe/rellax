import { recommendDraftPick } from '@/domain/draft-engine';
import { analyzeAdp } from '@/domain/adp';
import { valuePlayers } from '@/domain/valuation';
import {
  Card,
  DataUnavailable,
  ExplainDetails,
  PositionBadge,
  SampleDataBanner,
  Stat,
  WarningList,
} from '@/components/ui';
import { formatPercent, formatPoints } from '@/lib/format';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

export default async function DraftPage() {
  const loaded = await loadLeagueState();
  const { state } = loaded;

  if (state.seasonProjections.length === 0) {
    return (
      <Card title="Draft Assistant">
        <DataUnavailable
          reason="Draft recommendations need projections. Import a projection set or connect a provider first."
          lastUpdated={loaded.asOf}
        />
      </Card>
    );
  }

  const recommendation = recommendDraftPick(state);
  const qb = recommendation.qbScarcity;
  const myTeam = state.teams.find((t) => t.isMyTeam);

  const valuation = valuePlayers(state.config, state.players, state.seasonProjections, {
    injuries: state.injuries,
  });
  const adpAnalysis = analyzeAdp(valuation.players, state.adp);

  return (
    <>
      {loaded.isSample && <SampleDataBanner warnings={loaded.warnings} />}
      {!loaded.isSample && <WarningList warnings={loaded.warnings} />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Draft Assistant</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Round {recommendation.round}, pick {recommendation.pickInRound} · overall{' '}
            {recommendation.overall}
            {recommendation.onTheClock ? ' · you are on the clock' : ''}
          </p>
        </div>
        <dl className="flex gap-6">
          <Stat
            label="Picks until your turn"
            value={recommendation.picksUntilNextTurn ?? '—'}
            hint={
              recommendation.nextPickOverall
                ? `Next pick: #${recommendation.nextPickOverall}`
                : 'No further picks'
            }
          />
          <Stat label="Confidence" value={formatPercent(recommendation.confidence)} />
        </dl>
      </div>

      {/* 2-QB scarcity engine */}
      <Card
        title={qb.isTwoQb ? 'QB Scarcity Alert' : 'QB Scarcity'}
        subtitle={
          qb.isTwoQb
            ? `This league starts ${state.config.lineup.QB} QBs, so QB value works very differently than in a 1-QB league.`
            : 'Single-QB league.'
        }
      >
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Viable starting QBs left" value={qb.viableStartingQbs} emphasis />
          <Stat label="Weekly QB slots" value={qb.startingQbSlots} emphasis />
          <Stat
            label={`Teams needing a QB${state.config.lineup.QB > 1 ? state.config.lineup.QB : ''}`}
            value={qb.teamsNeedingQb2}
            emphasis
          />
          <Stat
            label="Next QB survives your wait"
            value={qb.survivalOfNextTierQb === null ? '—' : formatPercent(qb.survivalOfNextTierQb)}
            hint={
              qb.expectedQbsTakenBeforeMyNextPick === null
                ? undefined
                : `${qb.expectedQbsTakenBeforeMyNextPick} QBs expected to go first`
            }
            emphasis
          />
        </dl>
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950/60">
          <span className="font-semibold">
            {qb.recommendation === 'DRAFT_QB_NOW'
              ? 'Draft a QB now.'
              : qb.recommendation === 'QB_SOON'
                ? 'Take a QB soon.'
                : 'QB can wait.'}
          </span>{' '}
          Replacement level here is QB{qb.replacementRank}, and the gap from the best
          available QB down to replacement is {formatPoints(qb.eliteVsReplacementGap)} projected points.
        </p>
        <ExplainDetails
          formula={qb.explain.formula}
          inputs={qb.explain.inputs}
          sources={qb.explain.sources}
        />
      </Card>

      {/* Pick squeeze */}
      {recommendation.squeezes.length > 0 && (
        <Card title="Pick Squeeze" subtitle="Positions likely to be stripped before your next turn">
          <ul className="space-y-3">
            {recommendation.squeezes.map((squeeze) => (
              <li
                key={squeeze.position}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden>{squeeze.severity === 'HIGH' ? '⚠️' : '🟡'}</span>
                  <PositionBadge position={squeeze.position} />
                  <span className="text-sm font-semibold">{squeeze.severity} squeeze</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                  {squeeze.explain.formula}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Who should I draft? */}
      <Card
        title="Who should I draft?"
        subtitle="Dynamic Draft Value Score: value + scarcity + roster fit + urgency + opponent demand"
      >
        {recommendation.bestPick ? (
          <>
            <div className="rounded-lg border border-slate-900 bg-slate-900 p-4 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900">
              <p className="text-xs tracking-wide uppercase opacity-70">Best pick</p>
              <p className="mt-1 flex items-center gap-2 text-xl font-bold">
                {recommendation.bestPick.player.player.name}
                <PositionBadge position={recommendation.bestPick.player.player.position} />
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm opacity-90">
                {recommendation.reasoning.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs uppercase opacity-70">Value</p>
                  <p className="tabular font-semibold">{recommendation.bestPick.value}</p>
                </div>
                <div>
                  <p className="text-xs uppercase opacity-70">Roster fit</p>
                  <p className="tabular font-semibold">{recommendation.bestPick.rosterFit}</p>
                </div>
                <div>
                  <p className="text-xs uppercase opacity-70">Scarcity</p>
                  <p className="tabular font-semibold">{recommendation.bestPick.scarcity}</p>
                </div>
                <div>
                  <p className="text-xs uppercase opacity-70">Available at next pick</p>
                  <p className="tabular font-semibold">
                    {formatPercent(recommendation.bestPick.expectedAvailability)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {recommendation.safeAlternative && (
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Safe alternative
                  </p>
                  <p className="mt-1 flex items-center gap-2 font-semibold">
                    {recommendation.safeAlternative.player.player.name}
                    <PositionBadge
                      position={recommendation.safeAlternative.player.player.position}
                    />
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Healthy, high raw value ({recommendation.safeAlternative.value}/100) with
                    less dependence on how the board breaks.
                  </p>
                </div>
              )}
              {recommendation.bestValue && (
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Best value
                  </p>
                  <p className="mt-1 flex items-center gap-2 font-semibold">
                    {recommendation.bestValue.player.player.name}
                    <PositionBadge position={recommendation.bestValue.player.player.position} />
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Strong value at {formatPercent(recommendation.bestValue.expectedAvailability)}{' '}
                    chance of surviving to your next pick.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Player</th>
                    <th className="tabular py-2 pr-3 text-right">Draft score</th>
                    <th className="tabular py-2 pr-3 text-right">Value</th>
                    <th className="tabular py-2 pr-3 text-right">Fit</th>
                    <th className="tabular py-2 pr-3 text-right">Scarcity</th>
                    <th className="tabular py-2 pr-3 text-right">Avail.</th>
                    <th className="tabular py-2 text-right">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendation.candidates.map((candidate, index) => (
                    <tr
                      key={candidate.player.player.id}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                    >
                      <td className="tabular py-2 pr-3 text-slate-400">{index + 1}</td>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          <PositionBadge position={candidate.player.player.position} />
                          {candidate.player.player.name}
                        </span>
                      </td>
                      <td className="tabular py-2 pr-3 text-right font-semibold">
                        {candidate.draftScore}
                      </td>
                      <td className="tabular py-2 pr-3 text-right">{candidate.value}</td>
                      <td className="tabular py-2 pr-3 text-right">{candidate.rosterFit}</td>
                      <td className="tabular py-2 pr-3 text-right">{candidate.scarcity}</td>
                      <td className="tabular py-2 pr-3 text-right">
                        {formatPercent(candidate.expectedAvailability)}
                      </td>
                      <td className="tabular py-2 text-right">
                        {candidate.tier ?? '—'}
                        {candidate.tierRemaining > 0 && (
                          <span className="text-slate-400"> ({candidate.tierRemaining} left)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ExplainDetails
              formula={recommendation.bestPick.explain.formula}
              inputs={recommendation.bestPick.explain.inputs}
              sources={recommendation.bestPick.explain.sources}
            />
          </>
        ) : (
          <DataUnavailable
            reason="No available players with projections."
            lastUpdated={loaded.asOf}
          />
        )}
      </Card>

      {/* Opponent prediction */}
      <Card
        title="What will the other teams do?"
        subtitle={`Predicted next pick for each team selecting before your turn`}
      >
        {recommendation.predictions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You pick next, so there is nothing to predict.
          </p>
        ) : (
          <ul className="space-y-3">
            {recommendation.predictions.map((prediction) => {
              const team = state.teams.find((t) => t.id === prediction.teamId);
              return (
                <li
                  key={`${prediction.teamId}-${prediction.overall}`}
                  className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                >
                  <p className="text-sm font-semibold">
                    #{prediction.overall} — {team?.name ?? prediction.teamId}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {prediction.distribution.slice(0, 4).map((entry) => (
                      <li
                        key={entry.position}
                        className="flex items-center gap-1.5 rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800"
                      >
                        <PositionBadge position={entry.position} />
                        <span className="tabular font-medium">
                          {Math.round(entry.probability * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {prediction.explain.formula}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ADP vs value */}
      <Card
        title="ADP vs your league value"
        subtitle={
          adpAnalysis.source
            ? `ADP source: ${adpAnalysis.source}`
            : 'No ADP data loaded'
        }
      >
        {adpAnalysis.comparisons.length === 0 ? (
          <DataUnavailable
            reason="No ADP data is loaded. Import an ADP file on the Settings page to see values and reaches for this league's settings."
            lastUpdated={loaded.asOf}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">🚨 Values</h3>
              <ul className="space-y-2">
                {adpAnalysis.values.slice(0, 6).map((entry) => (
                  <li key={entry.player.player.id} className="text-sm">
                    <span className="font-medium">{entry.player.player.name}</span>{' '}
                    <span className="text-slate-500 dark:text-slate-400">
                      ADP {entry.adp} vs value rank {entry.leagueValueRank} —{' '}
                      {Math.round(entry.edgePicks)} picks of value
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Reaches</h3>
              <ul className="space-y-2">
                {adpAnalysis.reaches.slice(0, 6).map((entry) => (
                  <li key={entry.player.player.id} className="text-sm">
                    <span className="font-medium">{entry.player.player.name}</span>{' '}
                    <span className="text-slate-500 dark:text-slate-400">
                      ADP {entry.adp} vs value rank {entry.leagueValueRank}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      {myTeam && recommendation.myNeeds && (
        <Card title="Your roster needs" subtitle="Ranked by the value that filling them recovers">
          <ol className="space-y-1.5 text-sm">
            {recommendation.myNeeds.needOrder.map((position, index) => (
              <li key={position} className="flex items-center gap-3">
                <span className="w-5 text-slate-400">{index + 1}.</span>
                <PositionBadge position={position} />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-slate-900 dark:bg-slate-100"
                    style={{
                      width: `${(recommendation.myNeeds!.needByPosition[position] ?? 0) * 100}%`,
                    }}
                  />
                </div>
                <span className="tabular w-12 text-right text-xs text-slate-500 dark:text-slate-400">
                  {Math.round((recommendation.myNeeds!.needByPosition[position] ?? 0) * 100)}%
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </>
  );
}
