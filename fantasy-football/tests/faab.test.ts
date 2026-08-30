import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';
import { faabStatus, recommendBid, type FaabContext } from '@/domain/faab';
import { computeTeamNeeds, type TeamNeedsReport } from '@/domain/team-needs';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import {
  buildSampleLeagueState,
  buildSamplePlayers,
  buildSampleProjections,
  orderedSamplePool,
} from '@/providers/sample/sample-league';

const config = DEFAULT_LEAGUE_CONFIG;
const players = buildSamplePlayers();
const projections = buildSampleProjections();
const valuation = valuePlayers(config, players, projections);
const values = indexByPlayer(valuation);

/**
 * Build a FAAB context. `thinRoster` strips my team down to a few players so that a
 * genuine upgrade exists on the wire — a fully-drafted roster correctly bids $0 on
 * everything, which is right but makes for a useless fixture.
 */
function buildContext(
  overrides: Partial<FaabContext> = {},
  options: { thinRoster?: boolean } = {},
): FaabContext {
  const state = buildSampleLeagueState({ drafted: true, currentWeek: 5 });
  if (options.thinRoster) {
    const mine = state.teams.find((t) => t.isMyTeam)!;
    // Explicit mid-tier roster: leaves QB/K/DST slots open and owns none of the
    // players the tests bid on, so marginal gain is unambiguous.
    mine.roster = [
      { playerId: 'rb-30', slot: 'BENCH' },
      { playerId: 'wr-40', slot: 'BENCH' },
      { playerId: 'te-20', slot: 'BENCH' },
    ];
  }
  const needsByTeam = new Map<string, TeamNeedsReport>();
  for (const team of state.teams) {
    needsByTeam.set(team.id, computeTeamNeeds(config, team, values, valuation.players));
  }
  const myTeam = state.teams.find((t) => t.isMyTeam)!;
  return {
    config,
    myTeam,
    teams: state.teams,
    values,
    needsByTeam,
    scarcity: new Map(),
    currentWeek: 5,
    ...overrides,
  };
}

const pool = orderedSamplePool();
const freeAgent = valuation.players.find((v) => !pool.slice(0, 128).includes(v.player.id))!;

describe('recommendBid', () => {
  it('never bids more than the budget remaining', () => {
    const context = buildContext({}, { thinRoster: true });
    context.myTeam.faabRemaining = 12;
    const recommendation = recommendBid(context, values.get('qb-1')!);
    expect(recommendation.recommendedBid).toBeLessThanOrEqual(12);
    expect(recommendation.aggressiveBid).toBeLessThanOrEqual(12);
  });

  it('bids more for a player who improves the starting lineup than one who does not', () => {
    const context = buildContext({}, { thinRoster: true });
    const starter = values.get('qb-1')!; // elite QB, and this team starts two
    const scrub = values.get('wr-72')!; // last WR in the pool
    const forStarter = recommendBid(context, starter);
    const forScrub = recommendBid(context, scrub);
    expect(forStarter.recommendedBid).toBeGreaterThan(forScrub.recommendedBid);
    expect(forStarter.rosterImpact).toBeGreaterThan(forScrub.rosterImpact);
  });

  it('recommends $0 for a player who cannot crack a complete roster', () => {
    const context = buildContext(); // fully drafted team
    const recommendation = recommendBid(context, values.get('wr-72')!);
    expect(recommendation.recommendedBid).toBe(0);
    expect(recommendation.priority).toBe('LOW');
    expect(recommendation.reasoning.join(' ')).toContain('does not crack your starting lineup');
  });

  it('still bids on a genuine upgrade that is sitting in free agency', () => {
    const context = buildContext(); // fully drafted team
    const recommendation = recommendBid(context, freeAgent);
    expect(recommendation.recommendedBid).toBeGreaterThan(0);
    expect(recommendation.marginalStarterGain).toBeGreaterThan(0);
  });

  it('bids differently for the same player depending on remaining budget', () => {
    const rich = buildContext({}, { thinRoster: true });
    rich.myTeam.faabRemaining = 90;
    const poor = buildContext({}, { thinRoster: true });
    poor.myTeam.faabRemaining = 20;

    const target = values.get('qb-1')!;
    expect(recommendBid(rich, target).recommendedBid).toBeGreaterThan(
      recommendBid(poor, target).recommendedBid,
    );
  });

  it('returns a coherent bid range around the recommendation', () => {
    const recommendation = recommendBid(
      buildContext({}, { thinRoster: true }),
      values.get('qb-1')!,
    );
    expect(recommendation.bidRangeLow).toBeLessThanOrEqual(recommendation.recommendedBid);
    expect(recommendation.bidRangeHigh).toBeGreaterThanOrEqual(recommendation.recommendedBid);
    expect(recommendation.aggressiveBid).toBeGreaterThanOrEqual(recommendation.bidRangeHigh);
  });

  it('assesses each rival by both need and remaining budget', () => {
    const context = buildContext({}, { thinRoster: true });
    context.teams[1]!.faabRemaining = 100;
    context.teams[2]!.faabRemaining = 1;
    const recommendation = recommendBid(context, values.get('qb-1')!);

    const rich = recommendation.competitors.find((c) => c.teamId === context.teams[1]!.id)!;
    const broke = recommendation.competitors.find((c) => c.teamId === context.teams[2]!.id)!;
    expect(rich.estimatedMaxBid).toBeGreaterThanOrEqual(broke.estimatedMaxBid);
    expect(recommendation.competitors).toHaveLength(context.teams.length - 1);
  });

  it('flags a late-season pickup as a rental', () => {
    const context = buildContext({ currentWeek: 16 });
    const recommendation = recommendBid(context, freeAgent);
    expect(recommendation.isRentalOnly).toBe(true);
  });

  it('explains the bid arithmetic', () => {
    const recommendation = recommendBid(
      buildContext({}, { thinRoster: true }),
      values.get('qb-1')!,
    );
    expect(recommendation.explain.formula).toContain('bid =');
    expect(recommendation.explain.inputs).toHaveProperty('myFaabRemaining');
    expect(recommendation.explain.inputs).toHaveProperty('weeksRemaining');
    expect(recommendation.reasoning.length).toBeGreaterThan(2);
  });

  it('never returns a negative bid', () => {
    const context = buildContext({}, { thinRoster: true });
    for (const player of valuation.players.slice(0, 40)) {
      expect(recommendBid(context, player).recommendedBid).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('faabStatus', () => {
  it('ranks the league by remaining budget and marks my team', () => {
    const state = buildSampleLeagueState();
    for (const team of state.teams) team.faabRemaining = 40;
    state.teams[0]!.faabRemaining = 73; // my team
    state.teams[1]!.faabRemaining = 91;
    const status = faabStatus(config, state.teams);
    expect(status[0]!.remaining).toBe(91);
    expect(status.find((s) => s.isMyTeam)!.remaining).toBe(73);
    expect(status.find((s) => s.isMyTeam)!.sharePct).toBe(73);
  });
});
