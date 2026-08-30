import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { computeReplacementLevel, replacementRank } from '@/domain/replacement';
import type { LeagueConfig } from '@/domain/types';

const twoQb: LeagueConfig = DEFAULT_LEAGUE_CONFIG; // 8 teams, 2 QB
const oneQb: LeagueConfig = {
  ...DEFAULT_LEAGUE_CONFIG,
  teamCount: 12,
  lineup: { ...DEFAULT_LEAGUE_CONFIG.lineup, QB: 1 },
};

describe('replacementRank', () => {
  it('sets QB replacement far deeper in a 2-QB league than starting slots alone', () => {
    // 8 teams × 2 QB = 16 starters, plus a bench allowance.
    const rank = replacementRank(twoQb, 'QB');
    expect(rank).toBeGreaterThanOrEqual(16);
    expect(rank).toBeLessThanOrEqual(20);
  });

  it('is driven by league settings, not hard-coded numbers', () => {
    const eightTeamOneQb: LeagueConfig = {
      ...twoQb,
      lineup: { ...twoQb.lineup, QB: 1 },
    };
    expect(replacementRank(twoQb, 'QB')).toBeGreaterThan(
      replacementRank(eightTeamOneQb, 'QB'),
    );
  });

  it('scales with team count', () => {
    expect(replacementRank(oneQb, 'QB')).toBeGreaterThan(
      replacementRank({ ...oneQb, teamCount: 8 }, 'QB'),
    );
  });

  it('includes an expected flex share for RB and WR', () => {
    // 8 teams × 2 RB = 16 dedicated, plus flex share, plus bench allowance.
    expect(replacementRank(twoQb, 'RB')).toBeGreaterThan(16 + 7);
  });

  it('gives K and DST no bench allowance because they are streamed', () => {
    expect(replacementRank(twoQb, 'K')).toBe(8);
    expect(replacementRank(twoQb, 'DST')).toBe(8);
  });
});

describe('computeReplacementLevel', () => {
  it('reads replacement points off the remaining pool', () => {
    const pool = Array.from({ length: 30 }, (_, i) => 300 - i * 5);
    const level = computeReplacementLevel(twoQb, 'QB', pool);
    expect(level.points).toBe(300 - (level.rank - 1) * 5);
    expect(level.explain.formula).toContain('replacementRank(QB)');
  });

  it('rises as the pool drains during a draft', () => {
    const full = Array.from({ length: 30 }, (_, i) => 300 - i * 5);
    const drained = full.slice(6); // top 6 QBs drafted
    const before = computeReplacementLevel(twoQb, 'QB', full).points!;
    const after = computeReplacementLevel(twoQb, 'QB', drained).points!;
    expect(after).toBeLessThan(before);
  });

  it('reports unknown rather than zero when there is no data', () => {
    const level = computeReplacementLevel(twoQb, 'QB', []);
    expect(level.points).toBeNull();
    expect(level.explain.formula).toContain('unknown');
  });

  it('falls back to the shallowest available player when the pool is thin', () => {
    const level = computeReplacementLevel(twoQb, 'QB', [300, 280, 260]);
    expect(level.points).toBe(260);
  });
});
