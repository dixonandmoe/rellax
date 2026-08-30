import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { analyzeMatchup, normalCdf, normalWinProbability } from '@/domain/matchup';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import {
  buildSampleLeagueState,
  buildSamplePlayers,
  buildSampleProjections,
} from '@/providers/sample/sample-league';

const config = DEFAULT_LEAGUE_CONFIG;
const valuation = valuePlayers(config, buildSamplePlayers(), buildSampleProjections());
const values = indexByPlayer(valuation);

describe('normalCdf', () => {
  it('is 0.5 at zero and symmetric', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 3);
    expect(normalCdf(1) + normalCdf(-1)).toBeCloseTo(1, 3);
  });

  it('matches known values', () => {
    expect(normalCdf(1.645)).toBeCloseTo(0.95, 2);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 2);
  });
});

describe('normalWinProbability', () => {
  it('is 50% for identical projections', () => {
    expect(normalWinProbability(120, 120)).toBeCloseTo(0.5, 2);
  });

  it('favours the higher projection but never certainly', () => {
    const p = normalWinProbability(140, 110);
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.95);
  });
});

describe('analyzeMatchup', () => {
  it('produces both projections, a win probability and positional edges', () => {
    const state = buildSampleLeagueState({ drafted: true, currentWeek: 8 });
    const [mine, theirs] = [state.teams[0]!, state.teams[1]!];
    const analysis = analyzeMatchup(config, 8, mine, theirs, values);

    expect(analysis.myProjection).toBeGreaterThan(0);
    expect(analysis.opponentProjection).toBeGreaterThan(0);
    expect(analysis.winProbability).toBeGreaterThan(0);
    expect(analysis.winProbability).toBeLessThan(1);
    expect(analysis.edges.length).toBeGreaterThan(3);
    expect(analysis.biggestAdvantage).not.toBeNull();
    expect(analysis.biggestDisadvantage).not.toBeNull();
    expect(analysis.keyPlayerIds.length).toBeGreaterThan(0);
  });

  it('labels the win probability as a model output, not a data feed', () => {
    const state = buildSampleLeagueState({ drafted: true, currentWeek: 8 });
    const analysis = analyzeMatchup(config, 8, state.teams[0]!, state.teams[1]!, values);
    expect(analysis.explain.sources).toContain('model:normal-approximation');
  });
});
