import { describe, expect, it } from 'vitest';
import { analyzeAdp } from '@/domain/adp';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { valuePlayers } from '@/domain/valuation';
import { buildSamplePlayers, buildSampleProjections } from '@/providers/sample/sample-league';
import type { AdpEntry } from '@/domain/types';

const players = buildSamplePlayers();
const valued = valuePlayers(DEFAULT_LEAGUE_CONFIG, players, buildSampleProjections()).players;

function adp(playerId: string, value: number): AdpEntry {
  return { playerId, adp: value, format: 'consensus-redraft', source: 'test', asOf: 'now' };
}

describe('analyzeAdp', () => {
  it('flags a player going far later than his league value as a VALUE', () => {
    const target = valued[4]!; // league value rank 5
    const analysis = analyzeAdp(valued, [adp(target.player.id, 40)]);
    const comparison = analysis.comparisons[0]!;
    expect(comparison.classification).toBe('VALUE');
    expect(comparison.edgePicks).toBe(35);
    expect(analysis.values).toHaveLength(1);
  });

  it('flags a player going far earlier than his league value as a REACH', () => {
    const target = valued[80]!;
    const analysis = analyzeAdp(valued, [adp(target.player.id, 20)]);
    expect(analysis.comparisons[0]!.classification).toBe('REACH');
    expect(analysis.reaches).toHaveLength(1);
  });

  it('calls a small gap FAIR rather than manufacturing an edge', () => {
    const target = valued[30]!;
    const analysis = analyzeAdp(valued, [adp(target.player.id, 33)]);
    expect(analysis.comparisons[0]!.classification).toBe('FAIR');
  });

  it('reports players with no ADP instead of assuming one', () => {
    const analysis = analyzeAdp(valued, [adp(valued[0]!.player.id, 1)]);
    expect(analysis.missingAdp.length).toBe(valued.length - 1);
    expect(analysis.comparisons).toHaveLength(1);
  });

  it('records the ADP source so the number is traceable', () => {
    const analysis = analyzeAdp(valued, [adp(valued[0]!.player.id, 1)]);
    expect(analysis.source).toBe('test');
    expect(analysis.comparisons[0]!.explain.sources).toContain('adp:test');
  });
});
