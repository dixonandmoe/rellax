/**
 * Traceability primitives.
 *
 * Every calculated metric in this app returns its derivation alongside its value, so the
 * UI can prove any number it displays. This is the mechanism behind the brief's rule
 * that "every calculated metric should be traceable".
 */

export interface Explained<T> {
  value: T;
  /** Exactly the numbers/strings that went into the calculation. */
  inputs: Record<string, number | string | boolean>;
  /** Human-readable derivation, e.g. "VOR = 312.4 - 248.1". */
  formula: string;
  /** Data provenance of the inputs, e.g. ["projections:sample", "roster:espn"]. */
  sources: string[];
}

export function explained<T>(
  value: T,
  inputs: Record<string, number | string | boolean>,
  formula: string,
  sources: string[] = [],
): Explained<T> {
  return { value, inputs, formula, sources: dedupe(sources) };
}

export function dedupe(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/** Combine child derivations into a parent one without losing provenance. */
export function combine<T>(
  value: T,
  parts: Record<string, Explained<number>>,
  formula: string,
): Explained<T> {
  const inputs: Record<string, number> = {};
  const sources: string[] = [];
  for (const [key, part] of Object.entries(parts)) {
    inputs[key] = part.value;
    sources.push(...part.sources);
  }
  return { value, inputs, formula, sources: dedupe(sources) };
}

/** A value that is genuinely unknown. Renders as "Data unavailable", never as 0. */
export type Unknowable<T> = { known: true; value: T } | { known: false; reason: string };

export function known<T>(value: T): Unknowable<T> {
  return { known: true, value };
}

export function unknown<T>(reason: string): Unknowable<T> {
  return { known: false, reason };
}
