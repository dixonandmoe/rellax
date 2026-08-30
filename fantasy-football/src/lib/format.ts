/** Display helpers. Kept out of components so formatting is consistent app-wide. */

export function formatPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Math.round(value)}`;
}

export function formatSigned(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

/** Tailwind classes for a position badge. */
export function positionColor(position: string): string {
  switch (position) {
    case 'QB':
      return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-rose-500/30';
    case 'RB':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30';
    case 'WR':
      return 'bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-sky-500/30';
    case 'TE':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/30';
    case 'K':
      return 'bg-violet-500/15 text-violet-600 dark:text-violet-400 ring-violet-500/30';
    case 'DST':
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-slate-500/30';
    default:
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-slate-500/30';
  }
}

/** Tailwind classes for a letter grade. */
export function gradeColor(grade: string): string {
  const letter = grade.charAt(0);
  if (letter === 'A') return 'text-emerald-600 dark:text-emerald-400';
  if (letter === 'B') return 'text-sky-600 dark:text-sky-400';
  if (letter === 'C') return 'text-amber-600 dark:text-amber-400';
  if (letter === 'D') return 'text-orange-600 dark:text-orange-400';
  return 'text-rose-600 dark:text-rose-400';
}

export function priorityBadge(priority: 'HIGH' | 'MEDIUM' | 'LOW'): {
  icon: string;
  className: string;
} {
  switch (priority) {
    case 'HIGH':
      return { icon: '🔥', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/30' };
    case 'MEDIUM':
      return { icon: '🟡', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/30' };
    case 'LOW':
      return { icon: '🟢', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30' };
  }
}
