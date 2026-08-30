import { ImportPanel } from '@/components/import-panel';
import { describeScoring } from '@/ai/analysis-service';
import { Card, SampleDataBanner, WarningList } from '@/components/ui';
import { isAiConfigured, isDatabaseConfigured } from '@/lib/env';
import { loadLeagueState } from '@/services/league-state';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const loaded = await loadLeagueState();
  const { config } = loaded.state;

  const lineupRows: Array<[string, number]> = [
    ['QB', config.lineup.QB],
    ['RB', config.lineup.RB],
    ['WR', config.lineup.WR],
    ['TE', config.lineup.TE],
    ['FLEX', config.lineup.FLEX],
    ['SUPERFLEX', config.lineup.SUPERFLEX],
    ['K', config.lineup.K],
    ['DST', config.lineup.DST],
    ['Bench', config.lineup.BENCH],
    ['IR', config.lineup.IR],
  ];

  return (
    <>
      {loaded.isSample && <SampleDataBanner warnings={loaded.warnings} />}
      {!loaded.isSample && <WarningList warnings={loaded.warnings} />}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Every setting below is data, not code — changing it changes every calculation in
          the app.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="League" subtitle={config.name}>
          <dl className="space-y-2 text-sm">
            <Row label="Season" value={String(config.season)} />
            <Row label="Teams" value={String(config.teamCount)} />
            <Row label="Scoring" value={describeScoring(config)} />
            <Row label="Waivers" value={config.waiverType} />
            <Row label="FAAB budget" value={`$${config.faabBudget}`} />
            <Row label="Draft type" value={config.draftType} />
            <Row label="Draft rounds" value={String(config.draftRounds)} />
            <Row label="Your draft slot" value={config.myDraftSlot ? String(config.myDraftSlot) : 'not set'} />
            <Row label="Regular season" value={`${config.regularSeasonWeeks} weeks`} />
            <Row label="Playoff weeks" value={config.playoffWeeks.join(', ')} />
            <Row label="Playoff teams" value={String(config.playoffTeams)} />
            <Row label="Mode" value={config.seasonMode} />
            <Row label="Dynasty values" value={config.dynastyEnabled ? 'enabled' : 'disabled (redraft)'} />
          </dl>
        </Card>

        <Card title="Starting lineup">
          <dl className="space-y-2 text-sm">
            {lineupRows.map(([label, value]) => (
              <Row key={label} label={label} value={String(value)} />
            ))}
          </dl>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Flex accepts: {config.flexEligibility.join(', ')}.
            {config.lineup.SUPERFLEX > 0 &&
              ` Superflex accepts: ${config.superflexEligibility.join(', ')}.`}
          </p>
        </Card>
      </div>

      <Card title="Scoring rules">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Passing yards per point" value={String(config.scoring.passYardsPerPoint)} />
          <Row label="Passing TD" value={String(config.scoring.passTdPoints)} />
          <Row label="Interception" value={String(config.scoring.passIntPoints)} />
          <Row label="Rushing yards per point" value={String(config.scoring.rushYardsPerPoint)} />
          <Row label="Rushing TD" value={String(config.scoring.rushTdPoints)} />
          <Row label="Receiving yards per point" value={String(config.scoring.recYardsPerPoint)} />
          <Row label="Receiving TD" value={String(config.scoring.recTdPoints)} />
          <Row label="Reception" value={String(config.scoring.receptionPoints)} />
          <Row label="Fumble lost" value={String(config.scoring.fumbleLostPoints)} />
        </dl>
      </Card>

      <Card title="Environment">
        <dl className="space-y-2 text-sm">
          <Row label="Data provider" value={loaded.mode} />
          <Row
            label="AI analysis"
            value={
              isAiConfigured()
                ? 'Anthropic configured'
                : 'Not configured — deterministic engine analysis only'
            }
          />
          <Row
            label="Database"
            value={isDatabaseConfigured() ? 'DATABASE_URL set' : 'Not configured (no persistence)'}
          />
        </dl>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Secrets are read server-side only and are never sent to the browser. See
          ESPN_INTEGRATION.md for configuration.
        </p>
      </Card>

      <ImportPanel season={config.season} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-1.5 last:border-0 dark:border-slate-800/60">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
