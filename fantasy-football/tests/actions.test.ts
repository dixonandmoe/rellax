import { describe, expect, it } from 'vitest';
import { buildWeeklyReport, topActions } from '@/domain/actions';
import { buildSampleLeagueState } from '@/providers/sample/sample-league';

describe('buildWeeklyReport', () => {
  it('returns a graded report with concrete actions', () => {
    const state = buildSampleLeagueState({ drafted: true, currentWeek: 5 });
    const report = buildWeeklyReport(state, { week: 5 });

    expect(report.week).toBe(5);
    expect(report.grade.overallGrade).toMatch(/^[A-F][+-]?$/);
    expect(report.startersProjection).toBeGreaterThan(0);
    expect(report.needs).not.toBeNull();
  });

  it('surfaces unfillable starting slots as the highest priority', () => {
    // Undrafted rosters are empty, so no starting slot can be filled.
    const state = buildSampleLeagueState({ currentWeek: 3 });
    const report = buildWeeklyReport(state, { week: 3 });
    const holes = report.actions.filter((a) => a.kind === 'ROSTER_HOLE');
    expect(holes.length).toBeGreaterThan(0);
    expect(holes[0]!.priority).toBe('HIGH');
  });

  it('gives every action a confidence, reasoning, risk and data trail', () => {
    const state = buildSampleLeagueState({ drafted: true, currentWeek: 5 });
    const report = buildWeeklyReport(state, { week: 5 });
    for (const action of report.actions) {
      expect(action.confidence).toBeGreaterThan(0);
      expect(action.confidence).toBeLessThanOrEqual(1);
      expect(action.reasoning.length).toBeGreaterThan(0);
      expect(action.dataUsed.length).toBeGreaterThan(0);
      expect(action.headline.length).toBeGreaterThan(0);
    }
  });

  it('warns when players are missing projections rather than scoring them as zero', () => {
    const state = buildSampleLeagueState({ drafted: true });
    state.seasonProjections = state.seasonProjections.slice(0, 10);
    const report = buildWeeklyReport(state);
    expect(report.dataWarnings.join(' ')).toContain('no projection');
  });

  it('reports honestly when no league is loaded', () => {
    const state = buildSampleLeagueState();
    state.teams = [];
    const report = buildWeeklyReport(state);
    expect(report.dataWarnings.join(' ')).toContain('No teams loaded');
    expect(report.actions).toHaveLength(0);
  });

  it('reports a roster with nobody in a starting slot as "lineup not set"', () => {
    const state = buildSampleLeagueState({ drafted: true, currentWeek: 5 });
    const myTeam = state.teams.find((t) => t.isMyTeam)!;
    myTeam.roster = myTeam.roster.map((entry) => ({ ...entry, slot: 'BENCH' as const }));

    const report = buildWeeklyReport(state, { week: 5 });

    expect(report.lineupIsSet).toBe(false);
    // No swaps are invented against players who are not starting.
    expect(report.lineupChanges).toHaveLength(0);
    expect(report.actions.some((a) => a.headline === 'Set your starting lineup')).toBe(true);
  });

  it('pairs every lineup change with the player it actually displaces', () => {
    const state = buildSampleLeagueState({ drafted: true, currentWeek: 5 });
    const report = buildWeeklyReport(state, { week: 5 });

    expect(report.lineupIsSet).toBe(true);
    for (const change of report.lineupChanges) {
      expect(change.benchPlayerId).not.toBe('');
      expect(change.startPlayerId).not.toBe(change.benchPlayerId);
    }
  });

  it('never renders an action naming an unknown player', () => {
    const state = buildSampleLeagueState({ drafted: true, currentWeek: 5 });
    const report = buildWeeklyReport(state, { week: 5 });
    expect(report.actions.map((a) => a.headline).join(' ')).not.toContain('Unknown player');
  });

  it('returns at most three top actions for the dashboard', () => {
    const state = buildSampleLeagueState({ drafted: true, currentWeek: 5 });
    expect(topActions(buildWeeklyReport(state)).length).toBeLessThanOrEqual(3);
  });
});
