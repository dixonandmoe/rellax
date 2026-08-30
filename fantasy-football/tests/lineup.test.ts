import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { byeWeekExposure, marginalLineupGain, optimalLineup, slotSpecs } from '@/domain/lineup';
import type { LeagueConfig, RosterEntry } from '@/domain/types';
import type { ValuedPlayer } from '@/domain/valuation';

function fakePlayer(
  id: string,
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST',
  points: number,
  byeWeek?: number,
): ValuedPlayer {
  return {
    player: {
      id,
      name: id,
      position,
      status: 'ACTIVE',
      byeWeek,
      source: 'test',
      asOf: '2026-08-01T00:00:00.000Z',
    },
    projectedPoints: points,
    vor: points,
    leagueValue: points,
    overallRank: 1,
    positionRank: 1,
    availabilityFactor: 1,
    explain: { value: points, inputs: {}, formula: 'test', sources: ['test'] },
  };
}

function buildValues(entries: ValuedPlayer[]): Map<string, ValuedPlayer> {
  return new Map(entries.map((v) => [v.player.id, v]));
}

const config = DEFAULT_LEAGUE_CONFIG; // 2QB 2RB 2WR 1TE 1FLEX 1K 1DST

describe('slotSpecs', () => {
  it('creates one spec per starting slot in the league config', () => {
    // 2 + 2 + 2 + 1 + 1 + 1 + 1 = 10
    expect(slotSpecs(config)).toHaveLength(10);
  });

  it('honours a superflex configuration', () => {
    const superflex: LeagueConfig = {
      ...config,
      lineup: { ...config.lineup, QB: 1, SUPERFLEX: 1 },
    };
    const specs = slotSpecs(superflex);
    expect(specs.filter((s) => s.slot === 'SUPERFLEX')).toHaveLength(1);
    expect(specs.find((s) => s.slot === 'SUPERFLEX')!.eligible).toContain('QB');
  });
});

describe('optimalLineup', () => {
  it('fills dedicated slots with the best eligible players', () => {
    const roster = [
      fakePlayer('qb1', 'QB', 300),
      fakePlayer('qb2', 'QB', 280),
      fakePlayer('qb3', 'QB', 200),
      fakePlayer('rb1', 'RB', 250),
      fakePlayer('rb2', 'RB', 200),
      fakePlayer('wr1', 'WR', 240),
      fakePlayer('wr2', 'WR', 210),
      fakePlayer('te1', 'TE', 180),
      fakePlayer('k1', 'K', 130),
      fakePlayer('dst1', 'DST', 120),
      fakePlayer('rb3', 'RB', 190),
    ];
    const values = buildValues(roster);
    const entries: RosterEntry[] = roster.map((p) => ({ playerId: p.player.id, slot: 'BENCH' }));

    const lineup = optimalLineup(config, entries, values);
    const qbSlots = lineup.assignments.filter((a) => a.slot === 'QB').map((a) => a.playerId);
    expect(qbSlots).toEqual(['qb1', 'qb2']);
    // FLEX should take the best remaining flex-eligible player (rb3 at 190).
    expect(lineup.assignments.find((a) => a.slot === 'FLEX')!.playerId).toBe('rb3');
    expect(lineup.benchPlayerIds).toEqual(['qb3']);
  });

  it('reports unfilled slots rather than scoring them as zero silently', () => {
    const roster = [fakePlayer('qb1', 'QB', 300)];
    const values = buildValues(roster);
    const lineup = optimalLineup(config, [{ playerId: 'qb1', slot: 'BENCH' }], values);
    expect(lineup.unfilledSlots).toContain('RB');
    expect(lineup.unfilledSlots).toContain('DST');
    expect(lineup.startersPoints).toBe(300);
  });

  it('excludes IR players from the lineup', () => {
    const roster = [fakePlayer('qb1', 'QB', 300), fakePlayer('qb2', 'QB', 290)];
    const values = buildValues(roster);
    const lineup = optimalLineup(
      config,
      [
        { playerId: 'qb1', slot: 'BENCH' },
        { playerId: 'qb2', slot: 'IR' },
      ],
      values,
    );
    expect(lineup.assignments.filter((a) => a.slot === 'QB').map((a) => a.playerId)).toEqual([
      'qb1',
      null,
    ]);
  });
});

describe('marginalLineupGain', () => {
  it('values a player who fills an empty slot far above a redundant one', () => {
    const roster = [
      fakePlayer('qb1', 'QB', 300),
      fakePlayer('rb1', 'RB', 250),
      fakePlayer('rb2', 'RB', 240),
      fakePlayer('rb3', 'RB', 230),
      fakePlayer('wr1', 'WR', 220),
      fakePlayer('wr2', 'WR', 210),
      fakePlayer('te1', 'TE', 180),
    ];
    const values = buildValues(roster);
    const entries: RosterEntry[] = roster.map((p) => ({ playerId: p.player.id, slot: 'BENCH' }));

    const secondQb = fakePlayer('qb-new', 'QB', 200);
    const fourthRb = fakePlayer('rb-new', 'RB', 200);

    // The second QB slot is empty in a 2-QB league; a 4th RB only beats the FLEX guy.
    expect(marginalLineupGain(config, entries, values, secondQb)).toBeGreaterThan(
      marginalLineupGain(config, entries, values, fourthRb),
    );
  });

  it('is zero for a player who cannot crack the lineup', () => {
    const roster = [
      fakePlayer('qb1', 'QB', 300),
      fakePlayer('qb2', 'QB', 290),
      fakePlayer('rb1', 'RB', 250),
      fakePlayer('rb2', 'RB', 240),
      fakePlayer('rb3', 'RB', 235),
      fakePlayer('wr1', 'WR', 220),
      fakePlayer('wr2', 'WR', 210),
      fakePlayer('te1', 'TE', 180),
      fakePlayer('k1', 'K', 130),
      fakePlayer('dst1', 'DST', 120),
    ];
    const values = buildValues(roster);
    const entries: RosterEntry[] = roster.map((p) => ({ playerId: p.player.id, slot: 'BENCH' }));
    expect(marginalLineupGain(config, entries, values, fakePlayer('wr-bad', 'WR', 20))).toBe(0);
  });
});

describe('byeWeekExposure', () => {
  it('flags weeks where byes leave starting slots unfilled', () => {
    const roster = [
      fakePlayer('qb1', 'QB', 300, 7),
      fakePlayer('qb2', 'QB', 290, 7),
      fakePlayer('rb1', 'RB', 250, 9),
    ];
    const values = buildValues(roster);
    const entries: RosterEntry[] = roster.map((p) => ({ playerId: p.player.id, slot: 'BENCH' }));
    const byes = new Map(roster.map((p) => [p.player.id, p.player.byeWeek]));

    const exposure = byeWeekExposure(config, entries, values, byes);
    const week7 = exposure.find((e) => e.week === 7)!;
    expect(week7.playerIds).toEqual(['qb1', 'qb2']);
    expect(week7.holes).toBeGreaterThan(0);
  });
});
