import { describe, expect, it } from 'vitest';
import {
  extractStatLine,
  mapDraft,
  mapInjuryStatus,
  mapLeagueConfig,
  mapMatchups,
  mapPlayer,
  mapScoring,
  mapTeam,
  mapTransactions,
  type EspnLeaguePayload,
} from '@/providers/espn/mappers';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';

/**
 * These fixtures mirror the shapes documented in ESPN_INTEGRATION.md. They are structural
 * fixtures, not captured real-league data.
 */
const payload: EspnLeaguePayload = {
  id: 123456,
  seasonId: 2026,
  settings: {
    name: 'Test League',
    size: 8,
    rosterSettings: {
      lineupSlotCounts: {
        '0': 2, '2': 2, '4': 2, '6': 1, '16': 1, '17': 1, '20': 6, '21': 1, '23': 1,
      },
    },
    scoringSettings: {
      scoringItems: [
        { statId: 3, points: 0.04 }, // 25 yards per point
        { statId: 4, points: 4 },
        { statId: 20, points: -2 },
        { statId: 53, points: 0.5 }, // half PPR
        { statId: 42, points: 0.1 },
        { statId: 43, points: 6 },
      ],
    },
    acquisitionSettings: { acquisitionBudget: 100, isUsingAcquisitionBudget: true },
    scheduleSettings: { matchupPeriodCount: 13, playoffTeamCount: 4 },
  },
  teams: [
    {
      id: 1,
      name: 'Alpha',
      abbrev: 'ALP',
      owners: ['owner-1'],
      record: { overall: { wins: 5, losses: 2, ties: 0, pointsFor: 900, pointsAgainst: 820 } },
      transactionCounter: { acquisitionBudgetSpent: 27 },
      roster: {
        entries: [
          {
            playerId: 555,
            lineupSlotId: 0,
            acquisitionType: 'DRAFT',
            playerPoolEntry: {
              player: {
                id: 555,
                fullName: 'Test Quarterback',
                defaultPositionId: 1,
                proTeamId: 12,
                injuryStatus: 'QUESTIONABLE',
                stats: [
                  { statSourceId: 1, scoringPeriodId: 0, seasonId: 2026, stats: { '3': 4200, '4': 32, '20': 11 } },
                  { statSourceId: 0, scoringPeriodId: 0, seasonId: 2026, stats: { '3': 1200, '4': 9 } },
                ],
              },
            },
          },
        ],
      },
    },
    { id: 2, name: 'Bravo', transactionCounter: { acquisitionBudgetSpent: 0 } },
  ],
  schedule: [
    { matchupPeriodId: 1, home: { teamId: 1, totalPoints: 120 }, away: { teamId: 2, totalPoints: 118 }, winner: 'HOME' },
    { matchupPeriodId: 14, home: { teamId: 2 }, away: { teamId: 1 }, playoffTierType: 'WINNERS_BRACKET' },
  ],
  draftDetail: {
    drafted: true,
    picks: [
      { playerId: 555, teamId: 1, overallPickNumber: 1, roundId: 1, roundPickNumber: 1 },
      { playerId: 777, teamId: 2, overallPickNumber: 2, roundId: 1, roundPickNumber: 2 },
    ],
  },
  transactions: [
    { id: 'tx-1', type: 'WAIVER', scoringPeriodId: 4, teamId: 1, bidAmount: 17, proposedDate: 1_700_000_000_000, items: [{ playerId: 999 }] },
  ],
};

describe('mapLeagueConfig', () => {
  it('reads the 2-QB lineup out of ESPN slot counts', () => {
    const config = mapLeagueConfig(payload);
    expect(config.lineup.QB).toBe(2);
    expect(config.lineup.FLEX).toBe(1);
    expect(config.lineup.BENCH).toBe(6);
    expect(config.teamCount).toBe(8);
  });

  it('reads the FAAB budget and waiver type', () => {
    const config = mapLeagueConfig(payload);
    expect(config.waiverType).toBe('FAAB');
    expect(config.faabBudget).toBe(100);
  });

  it('falls back to the supplied defaults for anything ESPN omits', () => {
    const config = mapLeagueConfig({ id: 1, seasonId: 2026 }, DEFAULT_LEAGUE_CONFIG);
    expect(config.lineup.QB).toBe(DEFAULT_LEAGUE_CONFIG.lineup.QB);
    expect(config.playoffWeeks).toEqual(DEFAULT_LEAGUE_CONFIG.playoffWeeks);
  });
});

describe('mapScoring', () => {
  it('converts points-per-yard into yards-per-point', () => {
    const scoring = mapScoring(payload, DEFAULT_LEAGUE_CONFIG);
    expect(scoring.passYardsPerPoint).toBeCloseTo(25, 5);
    expect(scoring.recYardsPerPoint).toBeCloseTo(10, 5);
  });

  it('reads half-PPR straight through', () => {
    expect(mapScoring(payload, DEFAULT_LEAGUE_CONFIG).receptionPoints).toBe(0.5);
  });

  it('keeps the existing value for rules ESPN does not report', () => {
    const scoring = mapScoring({ settings: { scoringSettings: { scoringItems: [] } } }, DEFAULT_LEAGUE_CONFIG);
    expect(scoring.receptionPoints).toBe(DEFAULT_LEAGUE_CONFIG.scoring.receptionPoints);
  });
});

describe('mapTeam', () => {
  it('derives FAAB remaining from budget minus spend', () => {
    const team = mapTeam(payload.teams![0]!, 100);
    expect(team.faabRemaining).toBe(73);
  });

  it('never reports a negative FAAB balance', () => {
    const team = mapTeam({ id: 9, transactionCounter: { acquisitionBudgetSpent: 250 } }, 100);
    expect(team.faabRemaining).toBe(0);
  });

  it('marks my team from the configured external id', () => {
    expect(mapTeam(payload.teams![0]!, 100, '1').isMyTeam).toBe(true);
    expect(mapTeam(payload.teams![0]!, 100, '2').isMyTeam).toBe(false);
    expect(mapTeam(payload.teams![0]!, 100).isMyTeam).toBe(false);
  });

  it('maps lineup slots and acquisition types', () => {
    const team = mapTeam(payload.teams![0]!, 100);
    expect(team.roster[0]!.slot).toBe('QB');
    expect(team.roster[0]!.acquisitionType).toBe('DRAFT');
  });
});

describe('mapPlayer', () => {
  it('maps position, pro team and injury status', () => {
    const player = mapPlayer(payload.teams![0]!.roster!.entries![0]!.playerPoolEntry!.player!, 'now');
    expect(player.position).toBe('QB');
    expect(player.nflTeam).toBe('KC');
    expect(player.status).toBe('QUESTIONABLE');
    expect(player.source).toBe('espn');
  });

  it('treats unknown injury strings as active rather than throwing', () => {
    expect(mapInjuryStatus('SOMETHING_NEW')).toBe('ACTIVE');
    expect(mapInjuryStatus(undefined)).toBe('ACTIVE');
    expect(mapInjuryStatus('INJURY_RESERVE')).toBe('IR');
  });
});

describe('extractStatLine', () => {
  const player = payload.teams![0]!.roster!.entries![0]!.playerPoolEntry!.player!;

  it('separates projections from actuals by statSourceId', () => {
    const projected = extractStatLine(player, { projected: true, season: 2026 });
    const actual = extractStatLine(player, { projected: false, season: 2026 });
    expect(projected).toEqual({ passYards: 4200, passTd: 32, interceptions: 11 });
    expect(actual).toEqual({ passYards: 1200, passTd: 9 });
  });

  it('returns null rather than an empty line when no matching stats exist', () => {
    expect(extractStatLine(player, { projected: true, week: 7, season: 2026 })).toBeNull();
    expect(extractStatLine({ id: 1 }, { projected: true })).toBeNull();
  });
});

describe('mapDraft and mapMatchups', () => {
  it('maps draft picks in overall order and derives the draft order from round one', () => {
    const draft = mapDraft(payload, ['espn-team-1', 'espn-team-2']);
    expect(draft.picks.map((p) => p.overall)).toEqual([1, 2]);
    expect(draft.draftOrder).toEqual(['espn-team-1', 'espn-team-2']);
    expect(draft.currentOverall).toBe(3);
    expect(draft.complete).toBe(true);
  });

  it('flags playoff matchups and completion', () => {
    const matchups = mapMatchups(payload);
    expect(matchups[0]!.completed).toBe(true);
    expect(matchups[0]!.isPlayoff).toBe(false);
    expect(matchups[1]!.isPlayoff).toBe(true);
    expect(matchups[1]!.completed).toBe(false);
  });
});

describe('mapTransactions', () => {
  it('preserves the FAAB bid amount on waiver transactions', () => {
    const transactions = mapTransactions(payload);
    expect(transactions[0]!.type).toBe('WAIVER');
    expect(transactions[0]!.bidAmount).toBe(17);
    expect(transactions[0]!.playerExternalIds).toEqual(['espn-999']);
  });
});
