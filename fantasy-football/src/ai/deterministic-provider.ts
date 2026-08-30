import type { AiAnalysisInput, AiProvider, AiProviderResult, AiRecommendation } from './types';

/**
 * Deterministic provider.
 *
 * Produces the same recommendation shape as the model, straight from the engines'
 * computed metrics. Two jobs:
 *  1. The app works with no ANTHROPIC_API_KEY at all.
 *  2. Every AI claim has a non-AI counterpart to check against, so a hallucinated or
 *     rejected response has somewhere to fall back to.
 */
export class DeterministicAiProvider implements AiProvider {
  readonly name = 'deterministic' as const;

  isConfigured(): boolean {
    return true;
  }

  async analyze(input: AiAnalysisInput): Promise<AiProviderResult> {
    const actions = readActions(input);

    const recommendations: AiRecommendation[] =
      actions.length > 0
        ? actions.slice(0, 3).map((action) => ({
            recommendation: action.headline,
            confidence: action.confidence,
            reasoning: action.reasoning.length > 0 ? action.reasoning : [action.detail],
            dataUsed: action.dataUsed,
            risk: action.risk ?? 'Projections carry week-to-week variance.',
            alternative: action.alternative,
            playerIds: [],
          }))
        : [fallbackRecommendation(input)];

    return {
      response: {
        recommendations,
        summary: summarise(input),
      },
      provider: 'deterministic',
      validated: true,
    };
  }
}

interface ActionLike {
  headline: string;
  detail: string;
  reasoning: string[];
  dataUsed: string[];
  confidence: number;
  risk: string | null;
  alternative: string | null;
}

/** The actions engine's output is passed through computedMetrics.actions. */
function readActions(input: AiAnalysisInput): ActionLike[] {
  const raw = input.computedMetrics.actions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is ActionLike => {
    const candidate = item as Partial<ActionLike>;
    return typeof candidate?.headline === 'string' && typeof candidate?.confidence === 'number';
  });
}

function fallbackRecommendation(input: AiAnalysisInput): AiRecommendation {
  const topNeed = input.myTeam.needOrder[0];
  const weakest = input.myTeam.weaknesses[0];

  return {
    recommendation: topNeed
      ? `Address ${topNeed} — it is your biggest positional shortfall.`
      : 'No action required this week; your roster has no material shortfall.',
    confidence: topNeed ? 0.6 : 0.5,
    reasoning: [
      topNeed
        ? `${topNeed} is the position where upgrading recovers the most points relative to the freely available replacement in this ${input.league.teamCount}-team league.`
        : `Your starting lineup is fully filled and no position grades out below the league median.`,
      weakest ?? `League format: ${input.league.scoringSummary}.`,
    ],
    dataUsed: ['team-needs', 'projections', 'league-config'],
    risk: 'Computed from projections only; a projection source change moves this conclusion.',
    alternative: input.myTeam.needOrder[1]
      ? `Address ${input.myTeam.needOrder[1]} instead.`
      : null,
    playerIds: [],
  };
}

function summarise(input: AiAnalysisInput): string {
  const parts = [
    `${input.league.name}: ${input.league.teamCount} teams, ${input.league.scoringSummary}.`,
    `${input.myTeam.name} grades ${input.myTeam.grade}.`,
  ];
  if (input.myTeam.needOrder.length > 0) {
    parts.push(`Need order: ${input.myTeam.needOrder.join(' > ')}.`);
  }
  return parts.join(' ');
}
