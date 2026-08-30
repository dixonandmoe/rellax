import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { analyzeQbScarcity, computeScarcity, scarcityScore } from '@/domain/scarcity';
import { valuePlayers } from '@/domain/valuation';
import {
  buildSampleLeagueState,
  buildSamplePlayers,
  buildSampleProjections,
} from '@/providers/sample/sample-league';
import type { LeagueConfig } from '@/domain/types';

const players = buildSamplePlayers();
const projections = buildSampleProjections();
const valued = valuePlayers(DEFAULT_LEAGUE_CONFIG, players, projections).players;
const rosterPositions = new Map(players.map((p) => [p.id, p.position]));

const oneQb: LeagueConfig = {
  ...DEFAULT_LEAGUE_CONFIG,
  lineup: { ...DEFAULT_LEAGUE_CONFIG.lineup, QB: 1, BENCH: 7 },
};

describe('scarcityScore', () => {
  it('rises when viable players run short of open slots', () => {
    const plentiful = scarcityScore({
      viableRemaining: 40,
      openStartingSlots: 8,
      teamsNeeding: 2,
      teamCount: 8,
      dropToReplacement: 40,
      decayRate: 0.5,
    });
    const scarce = scarcityScore({
      viableRemaining: 6,
      openStartingSlots: 8,
      teamsNeeding: 6,
      teamCount: 8,
      dropToReplacement: 40,
      decayRate: 0.5,
    });
    expect(scarce).toBeGreaterThan(plentiful);
  });

  it('rises with a steeper quality cliff even when supply is equal', () => {
    const base = {
      viableRemaining: 12,
      openStartingSlots: 8,
      teamsNeeding: 4,
      teamCount: 8,
      dropToReplacement: 40,
    };
    expect(scarcityScore({ ...base, decayRate: 4 })).toBeGreaterThan(
      scarcityScore({ ...base, decayRate: 0.2 }),
    );
  });

  it('stays inside 0-100', () => {
    const extreme = scarcityScore({
      viableRemaining: 0,
      openStartingSlots: 16,
      teamsNeeding: 8,
      teamCount: 8,
      dropToReplacement: 500,
      decayRate: 100,
    });
    expect(extreme).toBeLessThanOrEqual(100);
    expect(extreme).toBeGreaterThanOrEqual(0);
  });
});

describe('computeScarcity', () => {
  it('rates QB scarcer in a 2-QB league than in a 1-QB league', () => {
    const state = buildSampleLeagueState();
    const two = computeScarcity(DEFAULT_LEAGUE_CONFIG, valued, state.teams, rosterPositions);
    const one = computeScarcity(oneQb, valued, state.teams, rosterPositions);
    expect(two.get('QB')!.score).toBeGreaterThan(one.get('QB')!.score);
  });

  it('counts open starting slots across the league, not just my team', () => {
    const state = buildSampleLeagueState({ drafted: true });
    const scarcity = computeScarcity(
      DEFAULT_LEAGUE_CONFIG,
      valued,
      state.teams,
      rosterPositions,
    );
    expect(scarcity.get('QB')!.openStartingSlots).toBeLessThan(16);
  });

  it('explains itself in league terms', () => {
    const state = buildSampleLeagueState();
    const scarcity = computeScarcity(
      DEFAULT_LEAGUE_CONFIG,
      valued,
      state.teams,
      rosterPositions,
    );
    expect(scarcity.get('QB')!.explain.formula).toContain('viable QBs remain');
  });
});

describe('analyzeQbScarcity', () => {
  it('identifies a 2-QB league and counts 16 weekly QB slots for 8 teams', () => {
    const state = buildSampleLeagueState();
    const report = analyzeQbScarcity(
      DEFAULT_LEAGUE_CONFIG,
      valued,
      state.teams,
      rosterPositions,
    );
    expect(report.isTwoQb).toBe(true);
    expect(report.startingQbSlots).toBe(16);
    expect(report.teamsNeedingQb2).toBe(8);
  });

  it('drops survival probability as the wait to my next pick grows', () => {
    const state = buildSampleLeagueState();
    const soon = analyzeQbScarcity(DEFAULT_LEAGUE_CONFIG, valued, state.teams, rosterPositions, {
      picksUntilMyNextTurn: 2,
    });
    const later = analyzeQbScarcity(DEFAULT_LEAGUE_CONFIG, valued, state.teams, rosterPositions, {
      picksUntilMyNextTurn: 18,
    });
    expect(later.survivalOfNextTierQb!).toBeLessThan(soon.survivalOfNextTierQb!);
    expect(later.expectedQbsTakenBeforeMyNextPick!).toBeGreaterThan(
      soon.expectedQbsTakenBeforeMyNextPick!,
    );
  });

  it('tells you to wait on QB in a 1-QB league with the same pool', () => {
    const state = buildSampleLeagueState();
    const report = analyzeQbScarcity(oneQb, valued, state.teams, rosterPositions, {
      picksUntilMyNextTurn: 18,
    });
    expect(report.isTwoQb).toBe(false);
    expect(report.recommendation).toBe('QB_CAN_WAIT');
  });

  it('urges drafting a QB when the wait is long in a 2-QB league', () => {
    const state = buildSampleLeagueState();
    const report = analyzeQbScarcity(
      DEFAULT_LEAGUE_CONFIG,
      valued,
      state.teams,
      rosterPositions,
      { picksUntilMyNextTurn: 18 },
    );
    expect(['DRAFT_QB_NOW', 'QB_SOON']).toContain(report.recommendation);
  });

  it('reports the elite-to-replacement gap that justifies the urgency', () => {
    const state = buildSampleLeagueState();
    const report = analyzeQbScarcity(
      DEFAULT_LEAGUE_CONFIG,
      valued,
      state.teams,
      rosterPositions,
    );
    expect(report.eliteVsReplacementGap).toBeGreaterThan(0);
    expect(report.replacementRank).toBeGreaterThanOrEqual(16);
  });
});
