import { buildTiers } from '@/domain/tiers';
import { valuePlayers } from '@/domain/valuation';
import {
  Card,
  DataUnavailable,
  ExplainDetails,
  PositionBadge,
  SampleDataBanner,
  WarningList,
} from '@/components/ui';
import { formatPoints } from '@/lib/format';
import { loadLeagueState } from '@/services/league-state';
import type { Position } from '@/domain/types';

export const dynamic = 'force-dynamic';

const TIER_ORDER: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];

export default async function PlayersPage() {
  const loaded = await loadLeagueState();
  const { state } = loaded;

  if (state.seasonProjections.length === 0) {
    return (
      <Card title="Players">
        <DataUnavailable
          reason="No projections are loaded, so players cannot be valued or tiered."
          lastUpdated={loaded.asOf}
        />
      </Card>
    );
  }

  const valuation = valuePlayers(state.config, state.players, state.seasonProjections, {
    injuries: state.injuries,
  });
  const tiers = buildTiers(valuation.players);
  const rosteredIds = new Set(state.teams.flatMap((t) => t.roster.map((r) => r.playerId)));

  return (
    <>
      {loaded.isSample && <SampleDataBanner warnings={loaded.warnings} />}
      {!loaded.isSample && <WarningList warnings={loaded.warnings} />}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Players</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Valued and tiered for this league&apos;s settings, not by generic rankings. Tiers are
          cut where the drop in projection is large relative to the position&apos;s typical gap.
        </p>
      </div>

      {valuation.missingProjections.length > 0 && (
        <WarningList
          warnings={[
            `${valuation.missingProjections.length} players have no projection and are excluded from every calculation on this page — they are not treated as zero-point players.`,
          ]}
        />
      )}

      <Card title="Top 25 by league value">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Player</th>
                <th className="py-2 pr-3">Team</th>
                <th className="tabular py-2 pr-3 text-right">Proj</th>
                <th className="tabular py-2 pr-3 text-right">VOR</th>
                <th className="tabular py-2 pr-3 text-right">Value</th>
                <th className="py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {valuation.players.slice(0, 25).map((player) => (
                <tr
                  key={player.player.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="tabular py-2 pr-3 text-slate-400">{player.overallRank}</td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <PositionBadge position={player.player.position} />
                      {player.player.name}
                      <span className="text-xs text-slate-400">
                        {player.player.position}
                        {player.positionRank}
                      </span>
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
                    {player.player.nflTeam ?? '—'}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">
                    {formatPoints(player.projectedPoints)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">{formatPoints(player.vor)}</td>
                  <td className="tabular py-2 pr-3 text-right font-semibold">
                    {player.leagueValue}
                  </td>
                  <td className="py-2 text-right text-xs">
                    {rosteredIds.has(player.player.id) ? (
                      <span className="text-slate-400">Rostered</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">Available</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {valuation.players[0] && (
          <ExplainDetails
            formula={valuation.players[0].explain.formula}
            inputs={valuation.players[0].explain.inputs}
            sources={valuation.players[0].explain.sources}
          />
        )}
      </Card>

      {TIER_ORDER.filter((position) => tiers.has(position)).map((position) => (
        <Card
          key={position}
          title={`${position} tiers`}
          subtitle={`Replacement level here is ${position}${
            valuation.replacementByPosition.get(position)?.rank ?? '?'
          } — set by this league's ${state.config.teamCount} teams and lineup requirements.`}
        >
          <ul className="space-y-3">
            {(tiers.get(position) ?? []).slice(0, 6).map((tier) => (
              <li key={tier.tier}>
                <p className="text-xs font-semibold tracking-wide uppercase">
                  Tier {tier.tier} · {tier.label}
                  {tier.dropToNext !== null && (
                    <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                      drop of {formatPoints(tier.dropToNext)} pts to the next tier
                    </span>
                  )}
                </p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {tier.players.map((player) => (
                    <li
                      key={player.player.id}
                      className={`rounded px-2 py-1 text-sm ${
                        rosteredIds.has(player.player.id)
                          ? 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {player.player.name}{' '}
                      <span className="tabular text-xs text-slate-500 dark:text-slate-400">
                        {formatPoints(player.projectedPoints)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
