import { AiResponseSchema, type AiAnalysisInput, type AiResponse } from './types';

/**
 * Response validation.
 *
 * Two checks, both required by the brief's rule that the AI may not invent data:
 *  1. Structural: the response matches the schema.
 *  2. Referential: every player the response names exists in the input we gave it.
 *
 * A response failing either is discarded — not repaired, not partially shown.
 */

export interface ValidationOutcome {
  ok: boolean;
  response?: AiResponse;
  errors: string[];
}

export function validateAiResponse(raw: unknown, input: AiAnalysisInput): ValidationOutcome {
  const parsed = AiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  const knownIds = new Set<string>([
    ...input.availablePlayers.map((p) => p.id),
    ...input.myTeam.roster.map((p) => p.id),
  ]);
  const knownNames = new Set<string>([
    ...input.availablePlayers.map((p) => normalise(p.name)),
    ...input.myTeam.roster.map((p) => normalise(p.name)),
  ]);

  const errors: string[] = [];

  for (const recommendation of parsed.data.recommendations) {
    for (const playerId of recommendation.playerIds) {
      if (!knownIds.has(playerId)) {
        errors.push(`Response references unknown player id "${playerId}".`);
      }
    }
  }

  // Catch a model that names a player in prose without declaring the id. We only flag
  // capitalised multi-word tokens that look like names and are not in the input.
  for (const recommendation of parsed.data.recommendations) {
    for (const candidate of extractNameLikeTokens(recommendation.recommendation)) {
      if (!knownNames.has(normalise(candidate))) {
        errors.push(`Response names "${candidate}", which was not in the supplied data.`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, response: parsed.data, errors: [] };
}

/**
 * Pull out things that look like player names: runs of two or more consecutive
 * Capitalised-then-lowercase words.
 *
 * This is a safety net for a model that names a player in prose without declaring the id,
 * so it must not produce false positives — a rejected response costs the user real advice.
 * Three rules keep it honest:
 *  - ALL-CAPS tokens are league vocabulary (QB, RB, FLEX, FAAB, IR), never names.
 *  - A run that begins at a sentence start drops its first word, because "Start", "Draft"
 *    and "Bid" are verbs there, not first names.
 *  - Known league phrases ("waiver wire", "best available") are filtered out.
 */
export function extractNameLikeTokens(text: string): string[] {
  const words = [...text.matchAll(/\S+/g)].map((match) => ({
    raw: match[0],
    index: match.index ?? 0,
  }));

  const isNameWord = (word: string) => /^[A-Z][a-z'\u2019.-]+$/.test(stripPunctuation(word));

  const results: string[] = [];
  let run: Array<{ raw: string; index: number }> = [];

  const flush = () => {
    if (run.length >= 2) {
      const startsSentence = isSentenceStart(text, run[0]!.index);
      const candidate = startsSentence ? run.slice(1) : run;
      if (candidate.length >= 2) {
        const phrase = candidate.map((w) => stripPunctuation(w.raw)).join(' ');
        if (!STOP_PHRASES.has(phrase.toLowerCase())) results.push(phrase);
      }
    }
    run = [];
  };

  for (const word of words) {
    if (isNameWord(word.raw)) run.push(word);
    else flush();
  }
  flush();

  return results;
}

/** True when this offset is the first word of the text or of a new sentence. */
function isSentenceStart(text: string, index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const char = text[i]!;
    if (/\s/.test(char)) continue;
    return /[.!?:;\u2014-]/.test(char);
  }
  return true;
}

function stripPunctuation(word: string): string {
  return word.replace(/^[^A-Za-z]+|[^A-Za-z'\u2019.-]+$/g, '');
}

/** Phrases that look name-like but are league vocabulary, not players. */
const STOP_PHRASES = new Set([
  'my team',
  'my roster',
  'free agency',
  'waiver wire',
  'trade target',
  'trade targets',
  'draft pick',
  'best available',
  'points per reception',
  'front office',
  'bye week',
  'starting lineup',
  'power rankings',
]);

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
