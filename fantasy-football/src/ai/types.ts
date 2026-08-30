import { z } from 'zod';

/**
 * AI analysis contract.
 *
 * The model is never asked "what do you think about these players" — it receives a
 * structured snapshot and the engines' computed metrics, and returns objects matching the
 * schema below. Responses are validated; a response that names a player who is not in the
 * input is discarded rather than shown.
 */

export const AiRecommendationSchema = z.object({
  /** One-line action, e.g. "Draft QB Three". */
  recommendation: z.string().min(3).max(200),
  /** 0-1. */
  confidence: z.number().min(0).max(1),
  /** Why, in this league's terms. Generic reasoning is rejected in review, not by code. */
  reasoning: z.array(z.string().min(10)).min(1).max(6),
  /** Which inputs this conclusion rests on, e.g. ["scarcity:QB", "roster:my-team"]. */
  dataUsed: z.array(z.string()).min(1),
  /** What could make this wrong. */
  risk: z.string().min(5),
  /** The next-best option. */
  alternative: z.string().nullable(),
  /** Player ids referenced, so they can be validated against the input. */
  playerIds: z.array(z.string()).default([]),
});

export type AiRecommendation = z.infer<typeof AiRecommendationSchema>;

export const AiResponseSchema = z.object({
  recommendations: z.array(AiRecommendationSchema).min(1).max(5),
  /** Optional short summary of the league situation. */
  summary: z.string().nullable().default(null),
});

export type AiResponse = z.infer<typeof AiResponseSchema>;

/** What the AI is asked to do. */
export type AiTask =
  | 'DRAFT_PICK'
  | 'WHAT_SHOULD_I_DO'
  | 'WAIVER_STRATEGY'
  | 'TRADE_REVIEW'
  | 'WEEKLY_LINEUP'
  | 'PLAYOFF_PLAN';

/**
 * The structured payload handed to the model. Deliberately contains no free prose about
 * players — only ids, names, positions and numbers the engines produced.
 */
export interface AiAnalysisInput {
  task: AiTask;
  league: {
    name: string;
    teamCount: number;
    scoringSummary: string;
    lineup: Record<string, number>;
    waiverType: string;
    faabBudget: number;
    seasonMode: string;
    week?: number;
  };
  myTeam: {
    id: string;
    name: string;
    record: string;
    faabRemaining: number;
    grade: string;
    positionGrades: Array<{ position: string; grade: string; leagueRank: number }>;
    strengths: string[];
    weaknesses: string[];
    needOrder: string[];
    roster: Array<{ id: string; name: string; position: string; projectedPoints: number; status: string }>;
  };
  otherTeams: Array<{
    id: string;
    name: string;
    record: string;
    faabRemaining: number;
    needOrder: string[];
    surplus: string[];
    tradeStance: string;
  }>;
  availablePlayers: Array<{
    id: string;
    name: string;
    position: string;
    projectedPoints: number;
    leagueValue: number;
    tier?: number;
  }>;
  computedMetrics: Record<string, unknown>;
  dataProvenance: Array<{ kind: string; source: string; asOf: string }>;
}

export interface AiProviderResult {
  response: AiResponse;
  provider: 'anthropic' | 'deterministic';
  model?: string;
  /** False when the model's answer failed validation and we fell back. */
  validated: boolean;
  validationErrors?: string[];
}

export interface AiProvider {
  readonly name: 'anthropic' | 'deterministic';
  isConfigured(): boolean;
  analyze(input: AiAnalysisInput): Promise<AiProviderResult>;
}
