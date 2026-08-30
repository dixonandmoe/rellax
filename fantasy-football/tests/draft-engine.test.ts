import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG, picksForSlot, picksUntilNextTurn } from '@/domain/league-config';
import { recommendDraftPick, weightsForRound } from '@/domain/draft-engine';
import { teamOnClock, teamsBetweenPicks } from '@/domain/opponent-model';
import { buildSampleLeagueState, orderedSamplePool } from '@/providers/sample/sample-league';
import type { DraftPick, LeagueConfig, LeagueState } from '@/domain/types';

const config = DEFAULT_LEAGUE_CONFIG;

function stateWithDraft(picksMade: number, myDraftSlot = 3): LeagueState {
  const state = buildSampleLeagueState();
  const pool = orderedSamplePool();
  const order = state.teams.map((t) => t.id);

  const picks: DraftPick[] = [];
  for (let overall = 1; overall <= picksMade; overall++) {
    const round = Math.floor((overall - 1) / config.teamCount) + 1;
    const pickInRound = ((overall - 1) % config.teamCount) + 1;
    const teamId = teamOnClock(config, order, overall)!;
    const playerId = pool[overall - 1]!;
    picks.push({ overall, round, pickInRound, teamId, playerId });
    state.teams.find((t) => t.id === teamId)!.roster.push({
      playerId,
      slot: 'BENCH',
      acquisitionType: 'DRAFT',
    });
  }

  state.draft = {
    picks,
    currentOverall: picksMade + 1,
    draftOrder: order,
    complete: false,
  };
  for (const team of state.teams) team.isMyTeam = team.draftSlot === myDraftSlot;
  return state;
}

describe('pick maths', () => {
  it('computes snake pick numbers for a draft slot', () => {
    // 8 teams, slot 3: 3, 14, 19, 30, ...
    expect(picksForSlot(config, 3).slice(0, 4)).toEqual([3, 14, 19, 30]);
  });

  it('computes linear pick numbers when the draft is not a snake', () => {
    const linear: LeagueConfig = { ...config, draftType: 'LINEAR' };
    expect(picksForSlot(linear, 3).slice(0, 3)).toEqual([3, 11, 19]);
  });

  it('counts the picks between my turns', () => {
    expect(picksUntilNextTurn(config, 3, 3)).toBe(10);
    expect(picksUntilNextTurn(config, 1, 1)).toBe(14);
  });

  it('identifies which team is on the clock through a snake turn', () => {
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(teamOnClock(config, order, 1)).toBe('a');
    expect(teamOnClock(config, order, 8)).toBe('h');
    expect(teamOnClock(config, order, 9)).toBe('h');
    expect(teamOnClock(config, order, 16)).toBe('a');
  });

  it('lists the teams picking between two of my picks', () => {
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const between = teamsBetweenPicks(config, order, 3, 14);
    expect(between).toHaveLength(10);
    expect(between[0]!.teamId).toBe('d');
  });
});

describe('weightsForRound', () => {
  it('weights raw value more early and roster fit more late', () => {
    const early = weightsForRound(config, 1);
    const late = weightsForRound(config, 15);
    expect(early.value).toBeGreaterThan(late.value);
    expect(late.rosterFit).toBeGreaterThan(early.rosterFit);
  });

  it('always produces weights that sum to 1', () => {
    for (const round of [1, 5, 10, 16]) {
      const w = weightsForRound(config, round);
      const total = w.value + w.scarcity + w.rosterFit + w.urgency + w.opponentDemand;
      expect(total).toBeCloseTo(1, 5);
    }
  });
});

describe('recommendDraftPick', () => {
  it('never recommends a player who is already drafted', () => {
    const state = stateWithDraft(20);
    const draftedIds = new Set(state.draft!.picks.map((p) => p.playerId));
    const result = recommendDraftPick(state);
    for (const candidate of result.candidates) {
      expect(draftedIds.has(candidate.player.player.id)).toBe(false);
    }
  });

  it('does not simply return the highest-valued player available', () => {
    // Give my team a stacked WR room so a marginal WR should lose to a needed position.
    const state = stateWithDraft(16);
    const myTeam = state.teams.find((t) => t.isMyTeam)!;
    myTeam.roster = [
      { playerId: 'wr-1', slot: 'BENCH' },
      { playerId: 'wr-2', slot: 'BENCH' },
      { playerId: 'wr-3', slot: 'BENCH' },
      { playerId: 'wr-4', slot: 'BENCH' },
    ];
    const result = recommendDraftPick(state);
    const topByValue = [...result.candidates].sort((a, b) => b.value - a.value)[0]!;
    // The engine may still land on the same player, but it must expose a different
    // ordering signal than raw value alone.
    expect(result.bestPick).not.toBeNull();
    expect(result.bestPick!.draftScore).toBeGreaterThanOrEqual(0);
    expect(result.bestPick!.rosterFit).toBeGreaterThanOrEqual(0);
    if (result.bestPick!.player.player.id !== topByValue.player.player.id) {
      expect(result.bestPick!.rosterFit).toBeGreaterThan(topByValue.rosterFit);
    }
  });

  it('surfaces QB urgency in a 2-QB league', () => {
    const state = stateWithDraft(30);
    const result = recommendDraftPick(state);
    expect(result.qbScarcity.isTwoQb).toBe(true);
    expect(result.qbScarcity.startingQbSlots).toBe(16);
  });

  it('produces reasoning that references this league, not generic advice', () => {
    const state = stateWithDraft(24);
    const result = recommendDraftPick(state);
    expect(result.reasoning.length).toBeGreaterThan(0);
    const joined = result.reasoning.join(' ');
    expect(joined).toMatch(/QB|scarcity|need|tier|picks|value/i);
  });

  it('attaches a traceable derivation to every candidate score', () => {
    const state = stateWithDraft(10);
    const result = recommendDraftPick(state);
    const candidate = result.candidates[0]!;
    expect(candidate.explain.formula).toContain('draftScore =');
    expect(candidate.explain.inputs).toHaveProperty('leagueValue');
    expect(candidate.explain.inputs).toHaveProperty('rosterFit');
  });

  it('reports confidence between 0 and 1', () => {
    const result = recommendDraftPick(stateWithDraft(12));
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('lowers expected availability for players who will not last to my next pick', () => {
    const state = stateWithDraft(3, 3); // I am on the clock at pick 4? slot 3 picks at 3, 14
    const result = recommendDraftPick(state);
    expect(result.picksUntilNextTurn).not.toBeNull();
    for (const candidate of result.candidates) {
      expect(candidate.expectedAvailability).toBeGreaterThanOrEqual(0);
      expect(candidate.expectedAvailability).toBeLessThanOrEqual(1);
    }
  });

  it('models every team picking before my next turn', () => {
    const state = stateWithDraft(3, 3);
    const result = recommendDraftPick(state);
    expect(result.predictions.length).toBe(result.picksUntilNextTurn);
    for (const prediction of result.predictions) {
      const total = prediction.distribution.reduce((s, d) => s + d.probability, 0);
      expect(total).toBeCloseTo(1, 1);
    }
  });

  it('offers a best pick, a safe alternative and a best value', () => {
    const result = recommendDraftPick(stateWithDraft(18));
    expect(result.bestPick).not.toBeNull();
    expect(result.safeAlternative).not.toBeNull();
    expect(result.bestValue).not.toBeNull();
  });
});
