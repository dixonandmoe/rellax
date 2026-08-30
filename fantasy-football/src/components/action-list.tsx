import type { RecommendedAction } from '@/domain/actions';
import { formatPercent, formatSigned, priorityBadge } from '@/lib/format';

/**
 * Renders recommendations in the shape the brief requires: recommendation, confidence,
 * reasoning, data used, risk, alternative — every field visible, none optional in the UI.
 */
export function ActionList({ actions }: { actions: RecommendedAction[] }) {
  if (actions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No actions to recommend. Either your roster has no addressable weakness, or there
        is not enough data loaded to find one.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {actions.map((action, index) => {
        const badge = priorityBadge(action.priority);
        return (
          <li
            key={`${action.kind}-${index}`}
            className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold">
                <span aria-hidden className="mr-1.5">
                  {badge.icon}
                </span>
                {index + 1}. {action.headline}
              </h3>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.className}`}
              >
                {action.priority}
              </span>
            </div>

            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{action.detail}</p>

            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  Why
                </dt>
                <dd>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
                    {action.reasoning.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </dd>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Confidence
                  </dt>
                  <dd className="tabular font-medium">{formatPercent(action.confidence)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Expected gain
                  </dt>
                  <dd className="tabular font-medium">
                    {action.expectedGain === null
                      ? '—'
                      : `${formatSigned(action.expectedGain)} pts`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Data used
                  </dt>
                  <dd className="text-xs text-slate-600 dark:text-slate-400">
                    {action.dataUsed.join(', ')}
                  </dd>
                </div>
              </div>

              {action.risk && (
                <div>
                  <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Risk
                  </dt>
                  <dd className="text-slate-600 dark:text-slate-300">{action.risk}</dd>
                </div>
              )}

              {action.alternative && (
                <div>
                  <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    Alternative
                  </dt>
                  <dd className="text-slate-600 dark:text-slate-300">{action.alternative}</dd>
                </div>
              )}
            </dl>
          </li>
        );
      })}
    </ol>
  );
}
