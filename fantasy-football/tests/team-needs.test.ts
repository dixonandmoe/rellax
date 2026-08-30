import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { computeTeamNeeds, inferTradeStance, requiredStarters } from '@/domain/team-needs';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import { buildSamplePlayers, buildSampleProjections } from '@/providers/sample/sample-league';
import type { FantasyTeam, LeagueConfig } from '@/domain/types';

const config = DEFAULT_LEAGUE_CONFIG;
const players = buildSamplePlayers();
const projections = buildSampleProjections();
const valuation = valuePlayers(config, players, projections);
const values = indexByPlayer(valuation);

function team(id: string, playerIds: string[], overrides: Partial<FantasyTeam> = {}): FantasyTeam {
  return {
    id,
    name: id,
    isMyTeam: false,
    roster: playerIds.map((playerId) => ({ playerId, slot: 'BENCH' as const })),
    faabRemaining: 100,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    ...overrides,
  };
}

describe('requiredStarters', () => {
  it('counts two QBs in a 2-QB league', () => {
    expect(requiredStarters(config, 'QB')).toBe(2);
  });

  it('adds a flex allowance to RB and WR but not TE', () => {
    expect(requiredStarters(config, 'RB')).toBe(3);
    expect(requiredStarters(config, 'WR')).toBe(3);
    expect(requiredStarters(config, 'TE')).toBe(1);
  });

  it('counts a superflex slot as a QB requirement', () => {
    const superflex: LeagueConfig = {
      ...config,
      lineup: { ...config.lineup, QB: 1, SUPERFLEX: 1 },
    };
    expect(requiredStarters(superflex, 'QB')).toBe(2);
  });
});

describe('computeTeamNeeds', () => {
  it('ranks a missing QB2 as an urgent need in a 2-QB league', () => {
    const oneQbTeam = team('t1', ['qb-1', 'rb-1', 'rb-2', 'rb-3', 'wr-1', 'wr-2', 'wr-3', 'te-1']);
    const needs = computeTeamNeeds(config, oneQbTeam, values, valuation.players);
    expect(needs.needOrder[0]).toBe('QB');
    expect(needs.needByPosition.QB!).toBeGreaterThan(0.3);
  });

  it('reports no QB need for a team with two elite QBs', () => {
    const stacked = team('t2', ['qb-1', 'qb-2', 'rb-1', 'rb-2', 'wr-1', 'wr-2', 'te-1']);
    const needs = computeTeamNeeds(config, stacked, values, valuation.players);
    expect(needs.needByPosition.QB).toBe(0);
  });

  it('identifies surplus positions', () => {
    const rbHeavy = team('t3', [
      'qb-1', 'qb-2', 'rb-1', 'rb-2', 'rb-3', 'rb-4', 'rb-5', 'rb-6', 'wr-40', 'te-20',
    ]);
    const needs = computeTeamNeeds(config, rbHeavy, values, valuation.players);
    expect(needs.surplus).toContain('RB');
    expect(needs.needOrder).toContain('WR');
  });

  it('lists unfilled starting slots', () => {
    const needs = computeTeamNeeds(config, team('t4', ['qb-1']), values, valuation.players);
    expect(needs.unfilledSlots).toContain('RB');
    expect(needs.unfilledSlots).toContain('K');
  });

  it('explains its conclusion in plain language', () => {
    const needs = computeTeamNeeds(
      config,
      team('t5', ['qb-1', 'rb-1', 'wr-1']),
      values,
      valuation.players,
    );
    expect(needs.explain.formula.length).toBeGreaterThan(10);
    expect(needs.explain.inputs).toHaveProperty('topNeed');
  });
});

describe('inferTradeStance', () => {
  it('makes an eliminated team a seller', () => {
    const losing = team('t6', [], { wins: 1, losses: 9 });
    expect(inferTradeStance(config, losing, ['RB'], ['WR'], { RB: 0.6 })).toBe('SELL');
  });

  it('makes a contender with a hole and surplus a buyer', () => {
    const winning = team('t7', [], { wins: 7, losses: 2 });
    expect(inferTradeStance(config, winning, ['RB'], ['WR'], { RB: 0.5 })).toBe('BUY');
  });

  it('keeps a balanced contender standing pat', () => {
    const winning = team('t8', [], { wins: 7, losses: 2 });
    expect(inferTradeStance(config, winning, [], [], {})).toBe('STAND_PAT');
  });

  it('treats the preseason separately from an in-season record', () => {
    const fresh = team('t9', [], { wins: 0, losses: 0 });
    expect(inferTradeStance(config, fresh, ['QB'], ['RB'], { QB: 0.8 })).toBe('BUY');
    expect(inferTradeStance(config, fresh, ['QB'], [], { QB: 0.1 })).toBe('STAND_PAT');
  });
});
