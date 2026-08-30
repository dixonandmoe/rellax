import { buildWeeklyReport, type WeeklyReport } from '@/domain/actions';
import { recommendDraftPick, type DraftRecommendation } from '@/domain/draft-engine';
import { computeTeamNeeds, type TeamNeedsReport } from '@/domain/team-needs';
import { gradeTeam } from '@/domain/team-grade';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import type { LeagueState } from '@/domain/types';
import { DeterministicAiProvider } from './deterministic-provider';
import type { AiAnalysisInput, AiProvider, AiProviderResult, AiTask } from './types';

/**
 * AI analysis service.
 *
 * Owns the translation from league state into the structured payload the model is allowed
 * to see, and the choice of provider. Nothing else in the app talks to an AI provider.
 */

export interface AnalysisOptions {
  task: AiTask;
  week?: number;
  provider?: AiProvider;
}

export async function analyze(
  state: LeagueState,
  options: AnalysisOptions,
): Promise<{ result: AiProviderResult; input: AiAnalysisInput }> {
  const input = buildAnalysisInput(state, options);
  const provider = options.provider ?? (await defaultProvider());
  const result = await provider.analyze(input);
  return { result, input };
}

/** Pick the provider: Anthropic when a key is present, deterministic otherwise. */
export async function defaultProvider(): Promise<AiProvider> {
  if (typeof window !== 'undefined' || !process.env.ANTHROPIC_API_KEY) {
    return new DeterministicAiProvider();
  }
  const { AnthropicAiProvider } = await import('./anthropic-provider');
  const provider = new AnthropicAiProvider();
  return provider.isConfigured() ? provider : new DeterministicAiProvider();
}

/**
 * Build the model's input.
 *
 * Everything here is either a raw fact from a provider or a number the engines computed.
 * There is no free-text player commentary for the model to riff on.
 */
export function buildAnalysisInput(
  state: LeagueState,
  options: AnalysisOptions,
): AiAnalysisInput {
  const { config, teams, players, seasonProjections, injuries } = state;
  const week = options.week ?? state.currentWeek;

  const valuation = valuePlayers(config, players, seasonProjections, { injuries });
  const values = indexByPlayer(valuation);
  const myTeam = teams.find((t) => t.isMyTeam) ?? teams[0];

  const needsByTeam = new Map<string, TeamNeedsReport>();
  for (const team of teams) {
    needsByTeam.set(team.id, computeTeamNeeds(config, team, values, valuation.players));
  }

  const rosteredIds = new Set(teams.flatMap((t) => t.roster.map((r) => r.playerId)));
  const available = valuation.players
    .filter((v) => !rosteredIds.has(v.player.id))
    .slice(0, 60);

  const grade = myTeam
    ? gradeTeam(config, myTeam, teams, values, valuation.players)
    : null;
  const myNeeds = myTeam ? needsByTeam.get(myTeam.id) : undefined;

  const computedMetrics = buildComputedMetrics(state, options);

  return {
    task: options.task,
    league: {
      name: config.name,
      teamCount: config.teamCount,
      scoringSummary: describeScoring(config),
      lineup: { ...config.lineup },
      waiverType: config.waiverType,
      faabBudget: config.faabBudget,
      seasonMode: config.seasonMode,
      week,
    },
    myTeam: {
      id: myTeam?.id ?? '',
      name: myTeam?.name ?? 'Unknown',
      record: myTeam ? `${myTeam.wins}-${myTeam.losses}${myTeam.ties ? `-${myTeam.ties}` : ''}` : '0-0',
      faabRemaining: myTeam?.faabRemaining ?? 0,
      grade: grade?.overallGrade ?? 'N/A',
      positionGrades:
        grade?.positionGrades.map((g) => ({
          position: g.position,
          grade: g.grade,
          leagueRank: g.leagueRank,
        })) ?? [],
      strengths: grade?.strengths ?? [],
      weaknesses: grade?.weaknesses ?? [],
      needOrder: myNeeds?.needOrder ?? [],
      roster:
        myTeam?.roster
          .map((entry) => values.get(entry.playerId))
          .filter((v): v is NonNullable<typeof v> => Boolean(v))
          .map((v) => ({
            id: v.player.id,
            name: v.player.name,
            position: v.player.position,
            projectedPoints: v.projectedPoints,
            status: v.player.status,
          })) ?? [],
    },
    otherTeams: teams
      .filter((t) => t.id !== myTeam?.id)
      .map((team) => {
        const needs = needsByTeam.get(team.id);
        return {
          id: team.id,
          name: team.name,
          record: `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}`,
          faabRemaining: team.faabRemaining,
          needOrder: needs?.needOrder ?? [],
          surplus: needs?.surplus ?? [],
          tradeStance: needs?.tradeStance ?? 'STAND_PAT',
        };
      }),
    availablePlayers: available.map((v) => ({
      id: v.player.id,
      name: v.player.name,
      position: v.player.position,
      projectedPoints: v.projectedPoints,
      leagueValue: v.leagueValue,
      tier: v.tier,
    })),
    computedMetrics,
    dataProvenance: buildProvenance(state),
  };
}

function buildComputedMetrics(
  state: LeagueState,
  options: AnalysisOptions,
): Record<string, unknown> {
  const metrics: Record<string, unknown> = {};

  if (options.task === 'DRAFT_PICK' && state.draft) {
    const draft: DraftRecommendation = recommendDraftPick(state);
    metrics.draft = {
      round: draft.round,
      overall: draft.overall,
      picksUntilNextTurn: draft.picksUntilNextTurn,
      confidence: draft.confidence,
      reasoning: draft.reasoning,
      qbScarcity: {
        isTwoQb: draft.qbScarcity.isTwoQb,
        viableStartingQbs: draft.qbScarcity.viableStartingQbs,
        startingQbSlots: draft.qbScarcity.startingQbSlots,
        teamsNeedingQb2: draft.qbScarcity.teamsNeedingQb2,
        survivalOfNextTierQb: draft.qbScarcity.survivalOfNextTierQb,
        recommendation: draft.qbScarcity.recommendation,
      },
      squeezes: draft.squeezes.map((s) => ({
        position: s.position,
        severity: s.severity,
        teamsNeedingPosition: s.teamsNeedingPosition,
        playersRemainingInTier: s.playersRemainingInTier,
        tierSurvivalProbability: s.tierSurvivalProbability,
      })),
      candidates: draft.candidates.slice(0, 8).map((c) => ({
        playerId: c.player.player.id,
        name: c.player.player.name,
        position: c.player.player.position,
        draftScore: c.draftScore,
        value: c.value,
        rosterFit: c.rosterFit,
        scarcity: c.scarcity,
        expectedAvailability: c.expectedAvailability,
        tierRemaining: c.tierRemaining,
        tierCliff: c.tierCliff,
      })),
      opponentPredictions: draft.predictions.map((p) => ({
        teamId: p.teamId,
        overall: p.overall,
        distribution: p.distribution.slice(0, 4),
      })),
    };
    metrics.scarcity = Object.fromEntries(
      [...draft.scarcity].map(([position, value]) => [
        position,
        {
          score: value.score,
          viableRemaining: value.viableRemaining,
          openStartingSlots: value.openStartingSlots,
          teamsNeeding: value.teamsNeeding,
        },
      ]),
    );
  } else {
    const report: WeeklyReport = buildWeeklyReport(state, { week: options.week });
    metrics.actions = report.actions;
    metrics.grade = {
      overall: report.grade.overallGrade,
      positions: report.grade.positionGrades,
      injuryRisk: report.grade.injuryRisk,
      byeRisk: report.grade.byeRisk,
    };
    metrics.waiverTargets = report.waiverTargets.map((t) => ({
      playerId: t.player.player.id,
      name: t.player.player.name,
      recommendedBid: t.recommendedBid,
      bidRange: [t.bidRangeLow, t.bidRangeHigh],
      expectedCompetition: t.expectedCompetition,
      rosterImpact: t.rosterImpact,
    }));
    metrics.tradeIdeas = report.tradeIdeas.map((idea) => ({
      partner: idea.partnerTeamName,
      receive: idea.receive.map((p) => p.player.name),
      send: idea.send.map((p) => p.player.name),
      myGain: idea.myGain,
      partnerGain: idea.partnerGain,
    }));
    metrics.dataWarnings = report.dataWarnings;
  }

  return metrics;
}

function buildProvenance(state: LeagueState): AiAnalysisInput['dataProvenance'] {
  const provenance: AiAnalysisInput['dataProvenance'] = [];
  const seen = new Set<string>();

  const add = (kind: string, source: string, asOf: string) => {
    const key = `${kind}:${source}`;
    if (seen.has(key)) return;
    seen.add(key);
    provenance.push({ kind, source, asOf });
  };

  for (const player of state.players.slice(0, 50)) add('players', player.source, player.asOf);
  for (const projection of state.seasonProjections.slice(0, 50)) {
    add('projections', projection.source, projection.asOf);
  }
  for (const entry of state.adp.slice(0, 10)) add('adp', entry.source, entry.asOf);

  return provenance;
}

export function describeScoring(config: LeagueState['config']): string {
  const ppr = config.scoring.receptionPoints;
  const pprLabel = ppr === 1 ? 'full PPR' : ppr === 0 ? 'standard (no PPR)' : `${ppr} PPR`;
  const qbLabel =
    config.lineup.SUPERFLEX > 0
      ? 'superflex'
      : config.lineup.QB >= 2
        ? `${config.lineup.QB}-QB`
        : '1-QB';
  return `${pprLabel}, ${qbLabel}, ${config.scoring.passTdPoints}pt passing TDs`;
}
