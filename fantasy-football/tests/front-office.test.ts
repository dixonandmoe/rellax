import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { gradeFrontOffice } from '@/domain/front-office';

const config = DEFAULT_LEAGUE_CONFIG;

describe('gradeFrontOffice', () => {
  it('rewards drafting players who beat the best alternative on the board', () => {
    const good = gradeFrontOffice(config, {
      draft: [
        { overall: 1, playerId: 'a', playerName: 'A', actualPoints: 300, bestAvailablePoints: 260 },
        { overall: 16, playerId: 'b', playerName: 'B', actualPoints: 240, bestAvailablePoints: 210 },
      ],
      waivers: [],
      trades: [],
      lineups: [],
    });
    const bad = gradeFrontOffice(config, {
      draft: [
        { overall: 1, playerId: 'a', playerName: 'A', actualPoints: 200, bestAvailablePoints: 300 },
      ],
      waivers: [],
      trades: [],
      lineups: [],
    });
    expect(good.draft.score).toBeGreaterThan(bad.draft.score);
    expect(good.draft.valueGained).toBeGreaterThan(0);
    expect(bad.draft.valueGained).toBeLessThan(0);
  });

  it('penalises leaving points on the bench', () => {
    const perfect = gradeFrontOffice(config, {
      draft: [], waivers: [], trades: [],
      lineups: [{ week: 1, actualPoints: 120, optimalPoints: 120 }],
    });
    const sloppy = gradeFrontOffice(config, {
      draft: [], waivers: [], trades: [],
      lineups: [{ week: 1, actualPoints: 100, optimalPoints: 120 }],
    });
    expect(perfect.lineups.score).toBe(100);
    expect(sloppy.lineups.score).toBeLessThan(perfect.lineups.score);
    expect(sloppy.lineups.pointsLeftOnBench).toBe(20);
  });

  it('measures FAAB efficiency in points per dollar', () => {
    const grade = gradeFrontOffice(config, {
      draft: [], trades: [], lineups: [],
      waivers: [
        { week: 3, playerId: 'x', playerName: 'X', bid: 20, pointsAdded: 90, replacementPoints: 40 },
      ],
    });
    expect(grade.faab.pointsPerDollar).toBe(2.5);
    expect(grade.waivers.valueGained).toBe(50);
  });

  it('treats never spending FAAB as a missed resource, not as neutral', () => {
    const grade = gradeFrontOffice(config, { draft: [], waivers: [], trades: [], lineups: [] });
    expect(grade.faab.score).toBeLessThan(50);
    expect(grade.faab.detail).toContain('No FAAB spent');
  });

  it('names the best and worst decisions', () => {
    const grade = gradeFrontOffice(config, {
      draft: [
        { overall: 1, playerId: 'a', playerName: 'Alpha', actualPoints: 320, bestAvailablePoints: 250 },
        { overall: 16, playerId: 'b', playerName: 'Bravo', actualPoints: 100, bestAvailablePoints: 240 },
      ],
      waivers: [], trades: [], lineups: [],
    });
    expect(grade.bestDecision).toContain('Alpha');
    expect(grade.worstDecision).toContain('Bravo');
  });

  it('produces a letter grade for every category', () => {
    const grade = gradeFrontOffice(config, { draft: [], waivers: [], trades: [], lineups: [] });
    for (const category of [grade.draft, grade.waivers, grade.trades, grade.lineups, grade.faab]) {
      expect(category.grade).toMatch(/^[A-F][+-]?$/);
    }
    expect(grade.overall.grade).toMatch(/^[A-F][+-]?$/);
  });
});
