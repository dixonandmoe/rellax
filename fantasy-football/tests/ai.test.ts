import { describe, expect, it } from 'vitest';
import { DeterministicAiProvider } from '@/ai/deterministic-provider';
import { safeJsonParse } from '@/ai/json';
import { extractNameLikeTokens, validateAiResponse } from '@/ai/validate';
import { analyze, buildAnalysisInput, describeScoring } from '@/ai/analysis-service';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { buildSampleLeagueState } from '@/providers/sample/sample-league';
import type { AiAnalysisInput } from '@/ai/types';

const state = buildSampleLeagueState({ drafted: true, currentWeek: 5 });
const input = buildAnalysisInput(state, { task: 'WHAT_SHOULD_I_DO', week: 5 });

function validResponse(): {
  recommendations: Array<{
    recommendation: string;
    confidence: number;
    reasoning: string[];
    dataUsed: string[];
    risk: string;
    alternative: string | null;
    playerIds: string[];
  }>;
  summary: string | null;
} {
  return {
    recommendations: [
      {
        recommendation: 'Bid on the best available running back',
        confidence: 0.8,
        reasoning: ['Your RB depth falls off sharply after the starters in this 8-team league.'],
        dataUsed: ['team-needs'],
        risk: 'Projections move week to week.',
        alternative: null,
        playerIds: [],
      },
    ],
    summary: null,
  };
}

describe('buildAnalysisInput', () => {
  it('gives the model structured league facts, not prose', () => {
    expect(input.league.teamCount).toBe(8);
    expect(input.league.lineup.QB).toBe(2);
    expect(input.league.scoringSummary).toContain('2-QB');
    expect(input.myTeam.roster.length).toBeGreaterThan(0);
    expect(input.otherTeams).toHaveLength(7);
  });

  it('includes computed metrics so the model does not have to derive anything', () => {
    expect(input.computedMetrics).toHaveProperty('actions');
    expect(input.computedMetrics).toHaveProperty('grade');
  });

  it('carries data provenance for every input source', () => {
    expect(input.dataProvenance.length).toBeGreaterThan(0);
    expect(input.dataProvenance.every((p) => p.source && p.asOf)).toBe(true);
    expect(input.dataProvenance.some((p) => p.source === 'synthetic-sample')).toBe(true);
  });

  it('switches to draft metrics for a draft task', () => {
    const drafting = buildSampleLeagueState();
    drafting.draft = { picks: [], currentOverall: 1, draftOrder: drafting.teams.map((t) => t.id), complete: false };
    const draftInput = buildAnalysisInput(drafting, { task: 'DRAFT_PICK' });
    expect(draftInput.computedMetrics).toHaveProperty('draft');
    expect(draftInput.computedMetrics).toHaveProperty('scarcity');
  });
});

describe('describeScoring', () => {
  it('describes this league in its own terms', () => {
    expect(describeScoring(DEFAULT_LEAGUE_CONFIG)).toBe('0.5 PPR, 2-QB, 4pt passing TDs');
  });

  it('recognises full PPR, standard and superflex', () => {
    expect(
      describeScoring({
        ...DEFAULT_LEAGUE_CONFIG,
        scoring: { ...DEFAULT_LEAGUE_CONFIG.scoring, receptionPoints: 1 },
        lineup: { ...DEFAULT_LEAGUE_CONFIG.lineup, QB: 1 },
      }),
    ).toContain('full PPR');
    expect(
      describeScoring({
        ...DEFAULT_LEAGUE_CONFIG,
        lineup: { ...DEFAULT_LEAGUE_CONFIG.lineup, QB: 1, SUPERFLEX: 1 },
      }),
    ).toContain('superflex');
  });
});

describe('validateAiResponse', () => {
  it('accepts a well-formed response that only names known players', () => {
    const outcome = validateAiResponse(validResponse(), input);
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toHaveLength(0);
  });

  it('rejects a response referencing a player id we never supplied', () => {
    const response = validResponse();
    response.recommendations[0]!.playerIds = ['not-a-real-player'];
    const outcome = validateAiResponse(response, input);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]).toContain('unknown player id');
  });

  it('rejects a response that invents a player name in prose', () => {
    const response = validResponse();
    response.recommendations[0]!.recommendation = 'Draft Patrick Mahomes immediately';
    const outcome = validateAiResponse(response, input);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.join(' ')).toContain('Patrick Mahomes');
  });

  it('rejects structurally invalid responses', () => {
    expect(validateAiResponse({ recommendations: [] }, input).ok).toBe(false);
    expect(validateAiResponse({ nope: true }, input).ok).toBe(false);
    expect(
      validateAiResponse(
        { recommendations: [{ ...validResponse().recommendations[0], confidence: 5 }], summary: null },
        input,
      ).ok,
    ).toBe(false);
  });

  it('does not flag league vocabulary as an invented player name', () => {
    const response = validResponse();
    response.recommendations[0]!.recommendation = 'Check the Waiver Wire for a Best Available back';
    const outcome = validateAiResponse(response, input);
    expect(outcome.ok).toBe(true);
  });
});

describe('extractNameLikeTokens', () => {
  it('finds capitalised multi-word tokens', () => {
    expect(extractNameLikeTokens('Start Jane Doe over someone')).toContain('Jane Doe');
  });

  it('ignores single capitalised words', () => {
    expect(extractNameLikeTokens('Draft RB now')).toHaveLength(0);
  });
});

describe('safeJsonParse', () => {
  it('parses clean JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('recovers JSON wrapped in prose or fences', () => {
    expect(safeJsonParse('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('returns null for unrecoverable text', () => {
    expect(safeJsonParse('no json here')).toBeNull();
  });
});

describe('DeterministicAiProvider', () => {
  it('always produces a valid response with no API key', async () => {
    const provider = new DeterministicAiProvider();
    expect(provider.isConfigured()).toBe(true);
    const result = await provider.analyze(input);

    expect(result.provider).toBe('deterministic');
    expect(result.validated).toBe(true);
    expect(result.response.recommendations.length).toBeGreaterThan(0);
    expect(validateAiResponse(result.response, input).ok).toBe(true);
  });

  it('gives every recommendation reasoning, data used, and a risk', async () => {
    const result = await new DeterministicAiProvider().analyze(input);
    for (const recommendation of result.response.recommendations) {
      expect(recommendation.reasoning.length).toBeGreaterThan(0);
      expect(recommendation.dataUsed.length).toBeGreaterThan(0);
      expect(recommendation.risk.length).toBeGreaterThan(5);
      expect(recommendation.confidence).toBeGreaterThan(0);
    }
  });

  it('falls back to a needs-based recommendation when there are no actions', async () => {
    const emptyInput: AiAnalysisInput = { ...input, computedMetrics: {} };
    const result = await new DeterministicAiProvider().analyze(emptyInput);
    expect(result.response.recommendations).toHaveLength(1);
    expect(result.response.recommendations[0]!.dataUsed).toContain('team-needs');
  });
});

describe('analyze', () => {
  it('runs end to end with an explicit deterministic provider', async () => {
    const { result, input: builtInput } = await analyze(state, {
      task: 'WHAT_SHOULD_I_DO',
      week: 5,
      provider: new DeterministicAiProvider(),
    });
    expect(result.response.recommendations.length).toBeGreaterThan(0);
    expect(builtInput.task).toBe('WHAT_SHOULD_I_DO');
  });
});
