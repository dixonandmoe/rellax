import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyze } from '@/ai/analysis-service';
import { loadLeagueState } from '@/services/league-state';

/**
 * Analysis endpoint.
 *
 * Runs entirely server-side so the Anthropic key never reaches the browser. Returns the
 * provider that actually answered and whether its response passed validation, so the UI
 * can be honest about which one the user is reading.
 */

const RequestSchema = z.object({
  task: z
    .enum(['DRAFT_PICK', 'WHAT_SHOULD_I_DO', 'WAIVER_STRATEGY', 'TRADE_REVIEW', 'WEEKLY_LINEUP', 'PLAYOFF_PLAN'])
    .default('WHAT_SHOULD_I_DO'),
  week: z.number().int().min(0).max(22).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const loaded = await loadLeagueState({ week: parsed.data.week });
    const { result } = await analyze(loaded.state, {
      task: parsed.data.task,
      week: parsed.data.week ?? loaded.state.currentWeek,
    });

    return NextResponse.json({
      provider: result.provider,
      model: result.model ?? null,
      validated: result.validated,
      validationErrors: result.validationErrors ?? [],
      summary: result.response.summary,
      recommendations: result.response.recommendations,
      dataSource: loaded.mode,
      isSample: loaded.isSample,
      asOf: loaded.asOf,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed.' },
      { status: 500 },
    );
  }
}
