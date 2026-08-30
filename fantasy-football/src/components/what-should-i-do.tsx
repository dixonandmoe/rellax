'use client';

import { useState } from 'react';
import type { RecommendedAction } from '@/domain/actions';
import { ActionList } from '@/components/action-list';

/**
 * The central UX feature: one button that answers "given the current state of my league,
 * what should I do next?".
 *
 * The deterministic top-3 is computed server-side and passed in, so the panel is useful
 * before any AI call. Pressing the button asks the AI layer for a narrative version;
 * if the AI is not configured or its answer fails validation, the deterministic answer
 * stays on screen and the UI says which one you are looking at.
 */
export function WhatShouldIDo({ initialActions }: { initialActions: RecommendedAction[] }) {
  const [expanded, setExpanded] = useState(false);
  const [aiState, setAiState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | {
        status: 'done';
        provider: string;
        validated: boolean;
        validationErrors?: string[];
        summary: string | null;
        recommendations: Array<{
          recommendation: string;
          confidence: number;
          reasoning: string[];
          dataUsed: string[];
          risk: string;
          alternative: string | null;
        }>;
      }
  >({ status: 'idle' });

  const run = async () => {
    setExpanded(true);
    setAiState({ status: 'loading' });
    try {
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'WHAT_SHOULD_I_DO' }),
      });
      if (!response.ok) {
        throw new Error(`Analysis failed with status ${response.status}`);
      }
      const payload = await response.json();
      setAiState({ status: 'done', ...payload });
    } catch (error) {
      setAiState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Analysis request failed.',
      });
    }
  };

  return (
    <section className="rounded-xl border border-slate-900 bg-slate-900 p-5 text-white shadow-sm dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">What should I do?</h2>
          <p className="text-sm opacity-80">
            Your top {Math.min(3, initialActions.length) || 3} actions, given every roster in
            the league.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-lg border border-white/30 px-3 py-2 text-sm font-medium transition hover:bg-white/10 dark:border-slate-900/30 dark:hover:bg-slate-900/10"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            onClick={run}
            disabled={aiState.status === 'loading'}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
          >
            {aiState.status === 'loading' ? 'Analysing…' : 'Run full analysis'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 rounded-lg bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
          {aiState.status === 'done' ? (
            <>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                {aiState.provider === 'anthropic' && aiState.validated
                  ? 'AI analysis (validated against the supplied data).'
                  : aiState.validated
                    ? 'Deterministic analysis from the calculation engines. Set ANTHROPIC_API_KEY for narrative analysis.'
                    : 'The AI response failed validation, so the deterministic analysis is shown instead.'}
              </p>
              {aiState.validationErrors && aiState.validationErrors.length > 0 && (
                <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-rose-600 dark:text-rose-400">
                  {aiState.validationErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
              {aiState.summary && (
                <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{aiState.summary}</p>
              )}
              <ol className="space-y-4">
                {aiState.recommendations.map((recommendation, index) => (
                  <li
                    key={`${recommendation.recommendation}-${index}`}
                    className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <h3 className="font-semibold">
                      {index + 1}. {recommendation.recommendation}
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                      {recommendation.reasoning.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <dl className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <div>
                        <dt className="inline font-medium">Confidence: </dt>
                        <dd className="inline tabular">
                          {Math.round(recommendation.confidence * 100)}%
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-medium">Risk: </dt>
                        <dd className="inline">{recommendation.risk}</dd>
                      </div>
                      {recommendation.alternative && (
                        <div>
                          <dt className="inline font-medium">Alternative: </dt>
                          <dd className="inline">{recommendation.alternative}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="inline font-medium">Data used: </dt>
                        <dd className="inline">{recommendation.dataUsed.join(', ')}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ol>
            </>
          ) : aiState.status === 'error' ? (
            <>
              <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{aiState.message}</p>
              <ActionList actions={initialActions} />
            </>
          ) : (
            <ActionList actions={initialActions} />
          )}
        </div>
      )}
    </section>
  );
}
