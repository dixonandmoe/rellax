import type { Position } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * Dynamic tiering.
 *
 * Tiers are cut where the *drop* between consecutive players is large relative to the
 * typical drop in that position group — not at fixed rank boundaries. That means tiers
 * reshape themselves as players are drafted, which is exactly what makes "the last player
 * in this tier" a meaningful draft signal.
 */

export interface Tier {
  position: Position;
  tier: number;
  label: string;
  players: ValuedPlayer[];
  /** Points between this tier's floor and the next tier's ceiling. */
  dropToNext: number | null;
}

export interface TieringOptions {
  /** A gap is a tier break when it exceeds this multiple of the median gap. */
  breakMultiplier?: number;
  /** Never create tiers larger than this. */
  maxTierSize?: number;
  /** Minimum absolute point gap to count as a break (avoids splitting flat groups). */
  minGap?: number;
}

const TIER_LABELS = [
  'Elite',
  'High-end starter',
  'Solid starter',
  'Low-end starter / high upside',
  'Risky starter',
  'Replacement level',
  'Deep bench',
];

export function buildTiers(
  players: ValuedPlayer[],
  options: TieringOptions = {},
): Map<Position, Tier[]> {
  const { breakMultiplier = 1.6, maxTierSize = 8, minGap = 4 } = options;

  const byPosition = new Map<Position, ValuedPlayer[]>();
  for (const player of players) {
    const list = byPosition.get(player.player.position) ?? [];
    list.push(player);
    byPosition.set(player.player.position, list);
  }

  const result = new Map<Position, Tier[]>();

  for (const [position, group] of byPosition) {
    const sorted = [...group].sort((a, b) => b.projectedPoints - a.projectedPoints);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i - 1]!.projectedPoints) - (sorted[i]!.projectedPoints));
    }
    // With very few gaps the median is not a meaningful baseline (with a single gap it
    // equals that gap, so nothing could ever exceed it). Fall back to the absolute
    // minimum-gap rule in that case.
    const median = medianOf(gaps);
    const threshold =
      gaps.length < 3 ? minGap : Math.max(median * breakMultiplier, minGap);

    const tiers: Tier[] = [];
    let current: ValuedPlayer[] = [];
    let tierNumber = 1;

    for (let i = 0; i < sorted.length; i++) {
      current.push(sorted[i]!);
      const gap = i + 1 < sorted.length ? gaps[i]! : null;
      const isBreak = gap !== null && (gap >= threshold || current.length >= maxTierSize);

      if (isBreak || i === sorted.length - 1) {
        tiers.push({
          position,
          tier: tierNumber,
          label: TIER_LABELS[tierNumber - 1] ?? `Tier ${tierNumber}`,
          players: current,
          dropToNext: gap,
        });
        // Annotate players so downstream code can read tier off the player.
        for (const p of current) p.tier = tierNumber;
        tierNumber++;
        current = [];
      }
    }

    result.set(position, tiers);
  }

  return result;
}

/** How many players remain in the same tier as this player (including them). */
export function tierRemaining(tiers: Map<Position, Tier[]>, player: ValuedPlayer): number {
  const positionTiers = tiers.get(player.player.position) ?? [];
  const tier = positionTiers.find((t) =>
    t.players.some((p) => p.player.id === player.player.id),
  );
  if (!tier) return 0;
  const index = tier.players.findIndex((p) => p.player.id === player.player.id);
  return tier.players.length - index;
}

/** The size of the cliff below a player's tier — the cost of waiting. */
export function tierCliff(tiers: Map<Position, Tier[]>, player: ValuedPlayer): number {
  const positionTiers = tiers.get(player.player.position) ?? [];
  const tier = positionTiers.find((t) =>
    t.players.some((p) => p.player.id === player.player.id),
  );
  return tier?.dropToNext ?? 0;
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}
