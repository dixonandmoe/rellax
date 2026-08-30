import { buildWeeklyReport } from '@/domain/actions';
import { faabStatus } from '@/domain/faab';
import {
  Card,
  DataUnavailable,
  ExplainDetails,
  PositionBadge,
  SampleDataBanner,
  Stat,
  WarningList,
} from '@/components/ui';
import { formatMoney, formatPoints } from '@/lib/format';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

export default async function WaiversPage() {
  const loaded = await loadLeagueState();
  const { state } = loaded;

  if (state.seasonProjections.length === 0) {
    return (
      <Card title="Waivers">
        <DataUnavailable
          reason="Bid recommendations need projections to measure what a player adds to your lineup."
          lastUpdated={loaded.asOf}
        />
      </Card>
    );
  }

  const report = buildWeeklyReport(state);
  const budgets = faabStatus(state.config, state.teams);
  const myTeam = state.teams.find((t) => t.isMyTeam);

  return (
    <>
      {loaded.isSample && <SampleDataBanner warnings={loaded.warnings} />}
      {!loaded.isSample && <WarningList warnings={[...loaded.warnings, ...report.dataWarnings]} />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Waivers &amp; FAAB</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Week {report.week} · {state.config.waiverType} waivers · $
            {state.config.faabBudget} season budget
          </p>
        </div>
        {myTeam && (
          <Stat
            label="Your FAAB"
            value={formatMoney(myTeam.faabRemaining)}
            hint={`${Math.round((myTeam.faabRemaining / state.config.faabBudget) * 100)}% of budget left`}
            emphasis
          />
        )}
      </div>

      {state.config.waiverType !== 'FAAB' ? (
        <Card title="Waiver type">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This league uses {state.config.waiverType} waivers, not FAAB, so bid amounts do
            not apply. The targets below are still ranked by how much they improve your
            starting lineup.
          </p>
        </Card>
      ) : null}

      <Card title="Waiver targets" subtitle="Ranked by what they add to YOUR roster, not by raw value">
        {report.waiverTargets.length === 0 ? (
          <DataUnavailable
            reason="No free agents are loaded, or none of them improve your roster."
            lastUpdated={loaded.asOf}
          />
        ) : (
          <ul className="space-y-4">
            {report.waiverTargets.map((target) => (
              <li
                key={target.player.player.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold">
                      <PositionBadge position={target.player.player.position} />
                      {target.player.player.name}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium dark:bg-slate-800">
                        {target.priority} priority
                      </span>
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Roster impact {Math.round(target.rosterImpact)}/100 · adds{' '}
                      {formatPoints(target.marginalStarterGain)} projected starting points
                      {target.isRentalOnly ? ' · short-term rental' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
                      Recommended bid
                    </p>
                    <p className="tabular text-2xl font-bold">
                      {formatMoney(target.recommendedBid)}
                    </p>
                    <p className="tabular text-xs text-slate-500 dark:text-slate-400">
                      Range {formatMoney(target.bidRangeLow)}–{formatMoney(target.bidRangeHigh)} ·
                      aggressive {formatMoney(target.aggressiveBid)}
                    </p>
                  </div>
                </div>

                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {target.reasoning.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>

                <div className="mt-3">
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Expected competition: {target.expectedCompetition}
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {target.competitors
                      .filter((competitor) => competitor.threat !== 'LOW')
                      .map((competitor) => (
                        <li
                          key={competitor.teamId}
                          className="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800"
                        >
                          {competitor.teamName} — {competitor.threat} (up to{' '}
                          {formatMoney(competitor.estimatedMaxBid)})
                        </li>
                      ))}
                    {target.competitors.every((c) => c.threat === 'LOW') && (
                      <li className="text-xs text-slate-500 dark:text-slate-400">
                        No rival combines the need and the budget to push this bid.
                      </li>
                    )}
                  </ul>
                </div>

                <ExplainDetails
                  formula={target.explain.formula}
                  inputs={target.explain.inputs}
                  sources={target.explain.sources}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="League FAAB status" subtitle="Who can actually outbid you">
        <ul className="space-y-2">
          {budgets.map((budget) => (
            <li key={budget.teamId} className="flex items-center gap-3 text-sm">
              <span className={`w-40 truncate ${budget.isMyTeam ? 'font-semibold' : ''}`}>
                {budget.teamName}
                {budget.isMyTeam && ' (you)'}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${
                    budget.isMyTeam ? 'bg-slate-900 dark:bg-slate-100' : 'bg-slate-400 dark:bg-slate-600'
                  }`}
                  style={{ width: `${budget.sharePct}%` }}
                />
              </div>
              <span className="tabular w-16 text-right font-medium">
                {formatMoney(budget.remaining)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
