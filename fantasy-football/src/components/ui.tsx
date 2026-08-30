import type { ReactNode } from 'react';
import { formatTimestamp, gradeColor, positionColor } from '@/lib/format';

/** Shared presentational primitives. No business logic lives in here. */

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>}
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </dt>
      <dd
        className={`tabular mt-1 ${emphasis ? 'text-2xl font-semibold' : 'text-lg font-medium'}`}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export function PositionBadge({ position }: { position: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${positionColor(position)}`}
    >
      {position}
    </span>
  );
}

export function GradePill({ grade, size = 'md' }: { grade: string; size?: 'md' | 'lg' }) {
  return (
    <span
      className={`font-bold ${gradeColor(grade)} ${size === 'lg' ? 'text-4xl' : 'text-xl'}`}
    >
      {grade}
    </span>
  );
}

/**
 * Renders genuinely missing data. Never substitute a zero for one of these — the whole
 * point is that the user can tell "we don't know" from "it is zero".
 */
export function DataUnavailable({
  reason,
  lastUpdated,
}: {
  reason: string;
  lastUpdated?: string | null;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center dark:border-slate-700 dark:bg-slate-950/50">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Data unavailable</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{reason}</p>
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Last updated: {formatTimestamp(lastUpdated)}
      </p>
    </div>
  );
}

export function SampleDataBanner({ warnings }: { warnings: string[] }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <p className="font-semibold">Synthetic sample data</p>
      <p className="mt-1">
        Player names, projections and ADP on this screen are generated placeholders, not
        real NFL data. Connect ESPN or import projections before making a real decision.
      </p>
      {warnings.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800 dark:text-amber-300">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="font-medium text-slate-700 dark:text-slate-200">Data notes</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-400">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

/** Expandable derivation, so any number on screen can be traced to its inputs. */
export function ExplainDetails({
  formula,
  inputs,
  sources,
}: {
  formula: string;
  inputs: Record<string, number | string | boolean>;
  sources: string[];
}) {
  return (
    <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
      <summary className="cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200">
        How this was calculated
      </summary>
      <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
        <p className="font-mono leading-relaxed break-words">{formula}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {Object.entries(inputs).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="truncate">{key}</dt>
              <dd className="tabular font-medium">{String(value)}</dd>
            </div>
          ))}
        </dl>
        {sources.length > 0 && <p>Sources: {sources.join(', ')}</p>}
      </div>
    </details>
  );
}

export function Bar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div className="h-full rounded-full bg-slate-900 dark:bg-slate-100" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-10 text-center">
      <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{body}</p>
    </div>
  );
}
