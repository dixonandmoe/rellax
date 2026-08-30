import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { validateAiResponse } from './validate';
import type { AiAnalysisInput, AiProvider, AiProviderResult } from './types';
import { DeterministicAiProvider } from './deterministic-provider';
import { safeJsonParse } from './json';

/**
 * Anthropic provider.
 *
 * Design constraints, all enforced here rather than trusted to the prompt alone:
 *  - The model sees only structured data (`AiAnalysisInput`), never raw prose about
 *    players.
 *  - The model is told explicitly that it may not introduce a player, number, or injury
 *    that is not in its input.
 *  - The response is schema- and reference-validated before it can be displayed. On
 *    failure we return the deterministic provider's answer and say validation failed.
 */

export const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are the analytics department for one specific fantasy football team.

You will receive a JSON snapshot of a league: its settings, the user's roster, every other
roster, available players, and metrics that have ALREADY been computed by a deterministic
engine. Your job is to turn those numbers into decisions.

Absolute rules:
- Use ONLY the data in the input. Never introduce a player, statistic, projection, injury,
  ADP or news item that is not present in it. If something is not in the input, say it is
  unavailable.
- Do not recompute or contradict the supplied metrics. If you disagree with a number, say
  so in the risk field; do not substitute your own.
- Every player you name must appear in myTeam.roster or availablePlayers, and you must
  list its id in playerIds.
- Explanations must be specific to THIS league and THIS roster. "He is projected to score
  a lot" is not acceptable. "Four teams picking before your next turn need RB, and the
  tier falls off 30 points after him" is.
- Cite the league's actual settings when they matter (e.g. a 2-QB league changes QB value).

Respond with JSON only, matching exactly:
{
  "summary": string | null,
  "recommendations": [
    {
      "recommendation": string,
      "confidence": number between 0 and 1,
      "reasoning": [string, ...],
      "dataUsed": [string, ...],
      "risk": string,
      "alternative": string | null,
      "playerIds": [string, ...]
    }
  ]
}`;

export class AnthropicAiProvider implements AiProvider {
  readonly name = 'anthropic' as const;
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async analyze(input: AiAnalysisInput): Promise<AiProviderResult> {
    if (!this.client) {
      return new DeterministicAiProvider().analyze(input);
    }

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Task: ${input.task}\n\nLeague snapshot:\n${JSON.stringify(input, null, 2)}`,
          },
          // Prefill forces the response to start as JSON rather than prose.
          { role: 'assistant', content: '{' },
        ],
      });

      const text = extractText(message);
      const parsed = safeJsonParse(`{${text}`);

      if (parsed === null) {
        return this.fallback(input, ['Model response was not valid JSON.']);
      }

      const validation = validateAiResponse(parsed, input);
      if (!validation.ok || !validation.response) {
        return this.fallback(input, validation.errors);
      }

      return {
        response: validation.response,
        provider: 'anthropic',
        model: this.model,
        validated: true,
      };
    } catch (error) {
      return this.fallback(input, [
        `Anthropic request failed: ${error instanceof Error ? error.message : String(error)}`,
      ]);
    }
  }

  private async fallback(
    input: AiAnalysisInput,
    validationErrors: string[],
  ): Promise<AiProviderResult> {
    const deterministic = await new DeterministicAiProvider().analyze(input);
    return { ...deterministic, validated: false, validationErrors };
  }
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
