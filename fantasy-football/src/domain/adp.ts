import { explained, type Explained } from './explain';
import { round2 } from './scoring';
import type { AdpEntry } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * ADP vs. league-adjusted value.
 *
 * Consensus ADP is built for 12-team 1-QB PPR leagues. In an 8-team 2-QB 0.5-PPR league
 * the correct draft position for many players is materially different. The gap between
 * where the market drafts a player and where this league says he belongs is the edge.
 */

export interface AdpComparison {
  player: ValuedPlayer;
  adp: number;
  /** Where this league's value model says he should go (1-indexed overall). */
  leagueValueRank: number;
  /** Positive = available later than he should be (a value). */
  edgePicks: number;
  classification: 'VALUE' | 'REACH' | 'FAIR';
  explain: Explained<number>;
}

export interface AdpAnalysis {
  comparisons: AdpComparison[];
  values: AdpComparison[];
  reaches: AdpComparison[];
  /** Players with no ADP data — reported, never guessed. */
  missingAdp: string[];
  source: string | null;
}

/** A gap of this many picks or more is worth flagging. */
export const ADP_EDGE_THRESHOLD = 12;

export function analyzeAdp(
  valued: ValuedPlayer[],
  adpEntries: AdpEntry[],
  options: { threshold?: number } = {},
): AdpAnalysis {
  const threshold = options.threshold ?? ADP_EDGE_THRESHOLD;
  const adpByPlayer = new Map(adpEntries.map((e) => [e.playerId, e]));
  const source = adpEntries[0]?.source ?? null;

  const comparisons: AdpComparison[] = [];
  const missing: string[] = [];

  for (const player of valued) {
    const entry = adpByPlayer.get(player.player.id);
    if (!entry) {
      missing.push(player.player.id);
      continue;
    }

    const edge = round2(entry.adp - player.overallRank);
    const classification: AdpComparison['classification'] =
      edge >= threshold ? 'VALUE' : edge <= -threshold ? 'REACH' : 'FAIR';

    comparisons.push({
      player,
      adp: entry.adp,
      leagueValueRank: player.overallRank,
      edgePicks: edge,
      classification,
      explain: explained(
        edge,
        {
          consensusAdp: entry.adp,
          leagueValueRank: player.overallRank,
          projectedPoints: player.projectedPoints,
          vor: player.vor,
        },
        `Consensus ADP ${entry.adp} vs this league's value rank ${player.overallRank} → ` +
          `${edge >= 0 ? `${round2(Math.abs(edge))} picks of value` : `drafted ${round2(Math.abs(edge))} picks early`}`,
        [`adp:${entry.source}`, 'projections', 'league-config'],
      ),
    });
  }

  const sorted = [...comparisons].sort((a, b) => b.edgePicks - a.edgePicks);

  return {
    comparisons: sorted,
    values: sorted.filter((c) => c.classification === 'VALUE'),
    reaches: [...sorted].reverse().filter((c) => c.classification === 'REACH'),
    missingAdp: missing,
    source,
  };
}
