import { describe, expect, it } from 'vitest';
import { buildTiers, tierCliff, tierRemaining } from '@/domain/tiers';
import type { ValuedPlayer } from '@/domain/valuation';

function player(id: string, position: 'QB' | 'RB', points: number): ValuedPlayer {
  return {
    player: { id, name: id, position, status: 'ACTIVE', source: 'test', asOf: 'now' },
    projectedPoints: points,
    vor: points,
    leagueValue: points,
    overallRank: 1,
    positionRank: 1,
    availabilityFactor: 1,
    explain: { value: points, inputs: {}, formula: '', sources: [] },
  };
}

describe('buildTiers', () => {
  it('cuts a tier where the drop is large relative to the typical drop', () => {
    const pool = [
      player('a', 'QB', 400),
      player('b', 'QB', 396),
      player('c', 'QB', 392),
      // 40-point cliff here
      player('d', 'QB', 352),
      player('e', 'QB', 348),
    ];
    const tiers = buildTiers(pool).get('QB')!;
    expect(tiers[0]!.players.map((p) => p.player.id)).toEqual(['a', 'b', 'c']);
    expect(tiers[1]!.players.map((p) => p.player.id)).toEqual(['d', 'e']);
  });

  it('does not split a smoothly declining group into noise tiers', () => {
    const pool = Array.from({ length: 10 }, (_, i) => player(`p${i}`, 'RB', 300 - i * 2));
    const tiers = buildTiers(pool).get('RB')!;
    // With a flat curve and maxTierSize 8, expect very few tiers.
    expect(tiers.length).toBeLessThanOrEqual(2);
  });

  it('annotates each player with its tier number', () => {
    const pool = [player('a', 'QB', 400), player('b', 'QB', 300)];
    buildTiers(pool);
    expect(pool[0]!.tier).toBe(1);
    expect(pool[1]!.tier).toBe(2);
  });

  it('reshapes tiers when the top of the board is removed', () => {
    const full = [
      player('a', 'QB', 400),
      player('b', 'QB', 398),
      player('c', 'QB', 340),
      player('d', 'QB', 338),
    ];
    const before = buildTiers(full).get('QB')!;
    const after = buildTiers(full.slice(2)).get('QB')!;
    expect(before.length).toBeGreaterThan(after.length);
  });
});

describe('tierRemaining and tierCliff', () => {
  it('counts how many players are left in a tier', () => {
    const pool = [
      player('a', 'QB', 400),
      player('b', 'QB', 398),
      player('c', 'QB', 396),
      player('d', 'QB', 320),
    ];
    const tiers = buildTiers(pool);
    expect(tierRemaining(tiers, pool[0]!)).toBe(3);
    expect(tierRemaining(tiers, pool[2]!)).toBe(1);
  });

  it('reports the size of the cliff below a tier', () => {
    const pool = [
      player('a', 'QB', 400),
      player('b', 'QB', 398),
      player('c', 'QB', 320),
    ];
    const tiers = buildTiers(pool);
    expect(tierCliff(tiers, pool[0]!)).toBe(78);
  });
});
