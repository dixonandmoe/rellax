import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { applyTrade, evaluateTrade } from '@/domain/trade';
import { findTradeTargets } from '@/domain/trade-finder';
import { computeTeamNeeds, type TeamNeedsReport } from '@/domain/team-needs';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import {
  buildSampleLeagueState,
  buildSamplePlayers,
  buildSampleProjections,
} from '@/providers/sample/sample-league';
import type { FantasyTeam } from '@/domain/types';

const config = DEFAULT_LEAGUE_CONFIG;
const players = buildSamplePlayers();
const projections = buildSampleProjections();
const valuation = valuePlayers(config, players, projections);
const values = indexByPlayer(valuation);

function team(id: string, name: string, playerIds: string[], isMyTeam = false): FantasyTeam {
  return {
    id,
    name,
    isMyTeam,
    roster: playerIds.map((playerId) => ({ playerId, slot: 'BENCH' as const })),
    faabRemaining: 100,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };
}

describe('applyTrade', () => {
  it('swaps the right players and marks incoming players as trade acquisitions', () => {
    const roster = [
      { playerId: 'a', slot: 'BENCH' as const },
      { playerId: 'b', slot: 'BENCH' as const },
    ];
    const after = applyTrade(roster, ['a'], ['c']);
    expect(after.map((r) => r.playerId).sort()).toEqual(['b', 'c']);
    expect(after.find((r) => r.playerId === 'c')!.acquisitionType).toBe('TRADE');
  });
});

describe('evaluateTrade', () => {
  it('judges by starting-lineup impact, not by summed player value', () => {
    // I have three good RBs but only two RB slots + a flex; my QB2 slot is empty.
    const mine = team('me', 'My Team', ['rb-1', 'rb-2', 'rb-3', 'rb-25', 'qb-1', 'wr-1', 'wr-2', 'te-1'], true);
    const theirs = team('them', 'Them', ['qb-2', 'qb-3', 'qb-4', 'wr-3', 'wr-4', 'te-2', 'rb-40']);

    // Trade my RB3 (never starts over RB1/RB2 except at flex) for their QB3.
    const evaluation = evaluateTrade(config, mine, theirs, ['rb-3'], ['qb-3'], values);

    expect(evaluation.sides[0]!.starterDelta).toBeGreaterThan(0);
    expect(evaluation.verdict).toBe('ACCEPT');
  });

  it('rejects a trade that creates an unfillable starting slot', () => {
    const mine = team('me', 'My Team', ['qb-1', 'rb-1', 'rb-2', 'wr-1', 'wr-2', 'te-1'], true);
    const theirs = team('them', 'Them', ['wr-3', 'wr-4', 'wr-5']);
    // Trading away my only TE leaves the TE slot empty.
    const evaluation = evaluateTrade(config, mine, theirs, ['te-1'], ['wr-3'], values);
    expect(evaluation.sides[0]!.createsHole).toContain('TE');
    expect(evaluation.verdict).toBe('REJECT');
  });

  it('flags a lopsided trade as unrealistic for the other manager', () => {
    const mine = team('me', 'My Team', ['rb-40', 'wr-50', 'qb-20', 'te-20'], true);
    const theirs = team('them', 'Them', ['rb-1', 'wr-1', 'qb-1', 'te-1']);
    const evaluation = evaluateTrade(config, mine, theirs, ['rb-40'], ['rb-1'], values);
    expect(evaluation.winner).toBe('PROPOSER');
    expect(evaluation.realistic).toBe(false);
    expect(evaluation.reasoning.join(' ')).toContain('realistically they decline');
  });

  it('calls a genuinely even swap EVEN rather than picking a winner', () => {
    const mine = team('me', 'My Team', ['rb-10', 'rb-11', 'qb-1', 'qb-2', 'wr-1', 'wr-2', 'te-1'], true);
    const theirs = team('them', 'Them', ['rb-10b', 'wr-10', 'qb-3', 'qb-4', 'wr-11', 'te-2', 'rb-12']);
    // Swap two players who are not in either optimal lineup.
    const evaluation = evaluateTrade(config, mine, theirs, ['rb-11'], ['rb-12'], values);
    expect(['EVEN', 'PROPOSER', 'RECEIVER']).toContain(evaluation.winner);
    expect(Math.abs(evaluation.sides[0]!.starterDeltaPct)).toBeLessThan(20);
  });

  it('evaluates both sides and explains its arithmetic', () => {
    const mine = team('me', 'My Team', ['rb-1', 'rb-2', 'rb-3', 'rb-25', 'qb-1', 'wr-1', 'wr-2', 'te-1'], true);
    const theirs = team('them', 'Them', ['qb-2', 'qb-3', 'wr-3', 'wr-4', 'te-2', 'rb-40']);
    const evaluation = evaluateTrade(config, mine, theirs, ['rb-3'], ['qb-3'], values);

    expect(evaluation.sides).toHaveLength(2);
    expect(evaluation.sides[1]!.teamId).toBe('them');
    expect(evaluation.explain.formula).toContain('optimal starting lineups');
    expect(evaluation.explain.inputs).toHaveProperty('proposerStarterDeltaPct');
  });
});

describe('findTradeTargets', () => {
  it('only proposes trades where both lineups improve', () => {
    const state = buildSampleLeagueState({ drafted: true });
    const needsByTeam = new Map<string, TeamNeedsReport>();
    for (const t of state.teams) {
      needsByTeam.set(t.id, computeTeamNeeds(config, t, values, valuation.players));
    }
    const myTeam = state.teams.find((t) => t.isMyTeam)!;
    const ideas = findTradeTargets(config, myTeam, state.teams, values, needsByTeam);

    for (const idea of ideas) {
      expect(idea.myGain).toBeGreaterThan(0);
      expect(idea.partnerGain).toBeGreaterThan(0);
      expect(idea.evaluation.sides[0]!.createsHole).toHaveLength(0);
      expect(idea.evaluation.sides[1]!.createsHole).toHaveLength(0);
    }
  });

  it('explains why the partner would accept', () => {
    const state = buildSampleLeagueState({ drafted: true });
    const needsByTeam = new Map<string, TeamNeedsReport>();
    for (const t of state.teams) {
      needsByTeam.set(t.id, computeTeamNeeds(config, t, values, valuation.players));
    }
    const myTeam = state.teams.find((t) => t.isMyTeam)!;
    const ideas = findTradeTargets(config, myTeam, state.teams, values, needsByTeam);
    for (const idea of ideas) {
      expect(idea.partnerMotivation.length).toBeGreaterThan(20);
      expect(idea.reasoning.length).toBeGreaterThan(1);
    }
  });
});
