import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import {
  buildSamplePlayers,
  buildSampleProjections,
} from '@/providers/sample/sample-league';
import type { LeagueConfig, Player, Projection } from '@/domain/types';

const players = buildSamplePlayers();
const projections = buildSampleProjections();

const twoQb = DEFAULT_LEAGUE_CONFIG;
const oneQb: LeagueConfig = {
  ...DEFAULT_LEAGUE_CONFIG,
  lineup: { ...DEFAULT_LEAGUE_CONFIG.lineup, QB: 1, BENCH: 7 },
};

describe('valuePlayers', () => {
  it('produces a value for every player that has a projection', () => {
    const result = valuePlayers(twoQb, players, projections);
    expect(result.players).toHaveLength(players.length);
    expect(result.missingProjections).toHaveLength(0);
  });

  it('reports players without projections instead of scoring them as zero', () => {
    const extra: Player = {
      id: 'ghost-1',
      name: 'No Projection Guy',
      position: 'WR',
      status: 'ACTIVE',
      source: 'test',
      asOf: '2026-08-01T00:00:00.000Z',
    };
    const result = valuePlayers(twoQb, [...players, extra], projections);
    expect(result.missingProjections).toContain('ghost-1');
    expect(result.players.find((v) => v.player.id === 'ghost-1')).toBeUndefined();
  });

  it('pushes far more QBs into the early rounds in a 2-QB league', () => {
    const qbsInTop = (config: LeagueConfig, n: number) =>
      valuePlayers(config, players, projections)
        .players.slice(0, n)
        .filter((v) => v.player.position === 'QB').length;

    // With 16 weekly QB slots instead of 8, QBs must be drafted far earlier.
    expect(qbsInTop(twoQb, 24)).toBeGreaterThan(qbsInTop(oneQb, 24));
    expect(qbsInTop(twoQb, 24)).toBeGreaterThanOrEqual(8);
  });

  it('gives the same player a higher VOR when replacement level is shallower', () => {
    const two = indexByPlayer(valuePlayers(twoQb, players, projections));
    const one = indexByPlayer(valuePlayers(oneQb, players, projections));
    expect(two.get('qb-1')!.vor).toBeGreaterThan(one.get('qb-1')!.vor);
  });

  it('normalises league value into 0-100', () => {
    const result = valuePlayers(twoQb, players, projections);
    for (const player of result.players) {
      expect(player.leagueValue).toBeGreaterThanOrEqual(0);
      expect(player.leagueValue).toBeLessThanOrEqual(100);
    }
    expect(result.players[0]!.leagueValue).toBe(100);
  });

  it('discounts injured players but does not zero them out', () => {
    const injured = players.map((p) =>
      p.id === 'rb-1' ? { ...p, status: 'OUT' as const } : p,
    );
    const healthy = indexByPlayer(valuePlayers(twoQb, players, projections));
    const hurt = indexByPlayer(valuePlayers(twoQb, injured, projections));

    expect(hurt.get('rb-1')!.projectedPoints).toBeLessThan(
      healthy.get('rb-1')!.projectedPoints,
    );
    expect(hurt.get('rb-1')!.projectedPoints).toBeGreaterThan(0);
  });

  it('can skip the injury discount for talent-only comparisons', () => {
    const injured = players.map((p) =>
      p.id === 'rb-1' ? { ...p, status: 'OUT' as const } : p,
    );
    const raw = indexByPlayer(
      valuePlayers(twoQb, injured, projections, { applyInjuryDiscount: false }),
    );
    const healthy = indexByPlayer(valuePlayers(twoQb, players, projections));
    expect(raw.get('rb-1')!.projectedPoints).toBe(healthy.get('rb-1')!.projectedPoints);
  });

  it('recomputes value from a restricted pool so replacement level moves', () => {
    const drafted = new Set(['qb-1', 'qb-2', 'qb-3', 'qb-4', 'qb-5', 'qb-6']);
    const remaining = new Set(players.map((p) => p.id).filter((id) => !drafted.has(id)));
    const after = valuePlayers(twoQb, players, projections, { playerIds: remaining });
    expect(after.players.some((v) => v.player.id === 'qb-1')).toBe(false);
    expect(after.replacementByPosition.get('QB')!.points).not.toBeNull();
  });

  it('attaches a traceable derivation to every value', () => {
    const result = valuePlayers(twoQb, players, projections);
    const top = result.players[0]!;
    expect(top.explain.formula).toContain('VOR');
    expect(top.explain.inputs).toHaveProperty('replacementPoints');
    expect(top.explain.sources).toContain('projections:synthetic-sample');
  });

  it('changes valuations when scoring changes', () => {
    const fullPpr: LeagueConfig = {
      ...twoQb,
      scoring: { ...twoQb.scoring, receptionPoints: 1 },
    };
    const half = indexByPlayer(valuePlayers(twoQb, players, projections));
    const full = indexByPlayer(valuePlayers(fullPpr, players, projections));
    expect(full.get('wr-1')!.projectedPoints).toBeGreaterThan(
      half.get('wr-1')!.projectedPoints,
    );
  });
});

describe('projection handling', () => {
  it('ignores weekly projections when valuing the season', () => {
    const weekly: Projection = {
      playerId: 'wr-1',
      season: 2026,
      week: 3,
      stats: { receptions: 100, recYards: 2000, recTd: 20 },
      source: 'test',
      asOf: '2026-08-01T00:00:00.000Z',
    };
    const withWeekly = valuePlayers(twoQb, players, [...projections, weekly]);
    const baseline = valuePlayers(twoQb, players, projections);
    expect(indexByPlayer(withWeekly).get('wr-1')!.projectedPoints).toBe(
      indexByPlayer(baseline).get('wr-1')!.projectedPoints,
    );
  });
});
