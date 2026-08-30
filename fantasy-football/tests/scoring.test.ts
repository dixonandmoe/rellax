import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING } from '@/domain/league-config';
import { pointsAllowedScore, scoreStatLine, scoreStatLineExplained } from '@/domain/scoring';
import type { ScoringRules } from '@/domain/types';

describe('scoreStatLine', () => {
  it('scores a passing line under 4pt-TD rules', () => {
    // 4000 yds / 25 = 160, 30 TD × 4 = 120, 10 INT × -2 = -20
    const points = scoreStatLine(
      { passYards: 4000, passTd: 30, interceptions: 10 },
      DEFAULT_SCORING,
    );
    expect(points).toBe(260);
  });

  it('applies half-point PPR to receptions', () => {
    const line = { receptions: 100, recYards: 1200, recTd: 8 };
    const halfPpr = scoreStatLine(line, DEFAULT_SCORING);
    // 100 × 0.5 = 50, 1200/10 = 120, 8 × 6 = 48
    expect(halfPpr).toBe(218);
  });

  it('changes the answer when the league changes PPR', () => {
    const line = { receptions: 100, recYards: 1200, recTd: 8 };
    const fullPpr: ScoringRules = { ...DEFAULT_SCORING, receptionPoints: 1 };
    const standard: ScoringRules = { ...DEFAULT_SCORING, receptionPoints: 0 };

    expect(scoreStatLine(line, fullPpr)).toBe(268);
    expect(scoreStatLine(line, standard)).toBe(168);
    expect(scoreStatLine(line, DEFAULT_SCORING)).toBe(218);
  });

  it('treats missing stats as absent, not as zero-value contributions', () => {
    expect(scoreStatLine({}, DEFAULT_SCORING)).toBe(0);
    expect(scoreStatLine({ rushYards: 100 }, DEFAULT_SCORING)).toBe(10);
  });

  it('scores negative plays', () => {
    expect(scoreStatLine({ fumblesLost: 3 }, DEFAULT_SCORING)).toBe(-6);
    expect(scoreStatLine({ interceptions: 4 }, DEFAULT_SCORING)).toBe(-8);
  });

  it('scores kicking by distance band', () => {
    const points = scoreStatLine(
      { fgMade0to39: 20, fgMade40to49: 8, fgMade50Plus: 4, patMade: 40, fgMissed: 5 },
      DEFAULT_SCORING,
    );
    // 60 + 32 + 20 + 40 - 5
    expect(points).toBe(147);
  });

  it('applies points-allowed tiers to DST', () => {
    expect(pointsAllowedScore(0, DEFAULT_SCORING)).toBe(10);
    expect(pointsAllowedScore(3, DEFAULT_SCORING)).toBe(7);
    expect(pointsAllowedScore(21, DEFAULT_SCORING)).toBe(0);
    expect(pointsAllowedScore(50, DEFAULT_SCORING)).toBe(-5);
  });

  it('produces a traceable derivation', () => {
    const result = scoreStatLineExplained(
      { passYards: 4000, passTd: 30 },
      DEFAULT_SCORING,
      'test-source',
    );
    expect(result.value).toBe(280);
    expect(result.inputs.passYards).toBe(4000);
    expect(result.formula).toContain('passYards(4000)');
    expect(result.sources).toContain('test-source');
  });
});
