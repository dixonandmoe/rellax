/**
 * SYNTHETIC SAMPLE DATA — NOT REAL PLAYERS, NOT REAL PROJECTIONS.
 *
 * Every record here carries `source: 'synthetic-sample'`, which the UI renders as a
 * persistent warning banner and which is excluded from exports. It exists so the app can
 * be developed and tested without inventing numbers that look like real projections.
 *
 * Player names are deliberately obviously fake ("QB One", "RB Twelve") so no output of
 * this app can ever be mistaken for advice about a real NFL player.
 */

import type {
  FantasyTeam,
  LeagueState,
  Player,
  Position,
  Projection,
  RosterEntry,
  StatLine,
} from '@/domain/types';
import { POSITIONS } from '@/domain/types';
import { DEFAULT_LEAGUE_CONFIG } from '@/domain/league-config';

export const SAMPLE_SOURCE = 'synthetic-sample';

const NUMBER_WORDS = [
  'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen', 'Twenty', 'TwentyOne', 'TwentyTwo', 'TwentyThree',
  'TwentyFour', 'TwentyFive', 'TwentySix', 'TwentySeven', 'TwentyEight',
  'TwentyNine', 'Thirty', 'ThirtyOne', 'ThirtyTwo', 'ThirtyThree', 'ThirtyFour',
  'ThirtyFive', 'ThirtySix', 'ThirtySeven', 'ThirtyEight', 'ThirtyNine', 'Forty',
];

interface PositionSpec {
  position: Position;
  count: number;
  /** Season points for the best player at the position. */
  top: number;
  /** Season points at the last generated player — sets the decay curve. */
  bottom: number;
  /** How front-loaded the curve is; >1 means a steep cliff at the top. */
  curve: number;
}

/**
 * Shape of each position's talent curve. These are *shapes*, chosen to reproduce
 * well-known structural facts (QB scoring is high and flat, RB falls off a cliff, TE has
 * a tiny elite tier), not projections of any real player.
 */
const POSITION_SPECS: PositionSpec[] = [
  { position: 'QB', count: 32, top: 402, bottom: 196, curve: 1.15 },
  { position: 'RB', count: 60, top: 318, bottom: 74, curve: 1.75 },
  { position: 'WR', count: 72, top: 296, bottom: 82, curve: 1.45 },
  { position: 'TE', count: 28, top: 214, bottom: 58, curve: 2.1 },
  { position: 'K', count: 20, top: 158, bottom: 108, curve: 1.05 },
  { position: 'DST', count: 20, top: 160, bottom: 82, curve: 1.2 },
];

const NFL_TEAMS = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU',
  'IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI',
  'PIT','SEA','SF','TB','TEN','WAS',
];

export function buildSamplePlayers(asOf = '2026-08-01T00:00:00.000Z'): Player[] {
  const players: Player[] = [];
  for (const spec of POSITION_SPECS) {
    for (let i = 0; i < spec.count; i++) {
      const label = NUMBER_WORDS[i] ?? `Num${i + 1}`;
      players.push({
        id: `${spec.position.toLowerCase()}-${i + 1}`,
        name: `${spec.position} ${label}`,
        position: spec.position,
        nflTeam: NFL_TEAMS[(i * 3 + spec.position.length) % NFL_TEAMS.length],
        byeWeek: 5 + ((i * 7 + spec.position.length) % 10),
        status: 'ACTIVE',
        source: SAMPLE_SOURCE,
        asOf,
      });
    }
  }
  return players;
}

/** Season points for the nth-best player at a position, following the spec's curve. */
export function samplePointsAtRank(spec: PositionSpec, rank: number): number {
  const t = (rank - 1) / Math.max(1, spec.count - 1);
  const decayed = Math.pow(t, spec.curve);
  return Math.round((spec.top - (spec.top - spec.bottom) * decayed) * 10) / 10;
}

/**
 * Turn a season point total back into a plausible stat line for that position, so the
 * scoring engine has real inputs to work on rather than pre-computed points.
 */
export function statLineForPoints(position: Position, points: number): StatLine {
  switch (position) {
    case 'QB': {
      const passTd = Math.round((points * 0.55) / 4);
      const passYards = Math.round(points * 8.2);
      return {
        passYards,
        passTd,
        interceptions: Math.max(3, Math.round(passTd * 0.42)),
        rushYards: Math.round(points * 0.55),
        rushTd: Math.round(points / 110),
      };
    }
    case 'RB': {
      const rushYards = Math.round(points * 3.4);
      const receptions = Math.round(points * 0.14);
      return {
        rushYards,
        rushTd: Math.round(points / 38),
        receptions,
        recYards: Math.round(receptions * 8.1),
        recTd: Math.round(points / 190),
        fumblesLost: points > 200 ? 2 : 1,
      };
    }
    case 'WR': {
      const receptions = Math.round(points * 0.31);
      return {
        receptions,
        recYards: Math.round(receptions * 12.6),
        recTd: Math.round(points / 36),
        rushYards: Math.round(points * 0.09),
      };
    }
    case 'TE': {
      const receptions = Math.round(points * 0.34);
      return {
        receptions,
        recYards: Math.round(receptions * 11.2),
        recTd: Math.round(points / 40),
      };
    }
    case 'K': {
      const fg = Math.round(points * 0.17);
      return {
        fgMade0to39: Math.round(fg * 0.55),
        fgMade40to49: Math.round(fg * 0.3),
        fgMade50Plus: Math.round(fg * 0.15),
        patMade: Math.round(points * 0.22),
      };
    }
    case 'DST':
      return {
        sacks: Math.round(points * 0.26),
        defInterceptions: Math.round(points * 0.09),
        fumbleRecoveries: Math.round(points * 0.06),
        defTd: Math.round(points / 90),
        pointsAllowed: Math.max(0, Math.round(30 - points / 9)),
      };
  }
}

export function buildSampleProjections(
  season = 2026,
  asOf = '2026-08-01T00:00:00.000Z',
): Projection[] {
  const projections: Projection[] = [];
  for (const spec of POSITION_SPECS) {
    for (let i = 0; i < spec.count; i++) {
      const points = samplePointsAtRank(spec, i + 1);
      projections.push({
        playerId: `${spec.position.toLowerCase()}-${i + 1}`,
        season,
        stats: statLineForPoints(spec.position, points),
        source: SAMPLE_SOURCE,
        asOf,
      });
    }
  }
  return projections;
}

/** Eight sample teams. Team 1 is "my team". Rosters are optionally pre-filled. */
export function buildSampleTeams(options: { drafted?: boolean } = {}): FantasyTeam[] {
  const teams: FantasyTeam[] = [];
  for (let i = 0; i < 8; i++) {
    teams.push({
      id: `team-${i + 1}`,
      name: i === 0 ? 'My Team' : `Team ${String.fromCharCode(65 + i)}`,
      ownerName: i === 0 ? 'You' : `Manager ${String.fromCharCode(65 + i)}`,
      isMyTeam: i === 0,
      draftSlot: i + 1,
      roster: [],
      faabRemaining: 100,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  }

  if (options.drafted) {
    runSampleDraft(teams, 16);
    for (const team of teams) assignSampleLineup(team);
  }

  return teams;
}

/**
 * Snake-draft the sample pool.
 *
 * Skill positions go by value, and the last two rounds take a kicker and a defence — which
 * is what managers actually do, and which keeps the sample league from permanently
 * reporting unfillable K/DST slots.
 */
export function runSampleDraft(teams: FantasyTeam[], rounds: number): void {
  const skillPool = orderedSamplePool().filter((id) => !id.startsWith('k-') && !id.startsWith('dst-'));
  const kickers = POSITION_SPECS.find((s) => s.position === 'K');
  const defenses = POSITION_SPECS.find((s) => s.position === 'DST');

  let index = 0;
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 === 0 ? teams : [...teams].reverse();
    const roundsFromEnd = rounds - round;

    order.forEach((team, seat) => {
      let playerId: string | undefined;
      if (roundsFromEnd === 2 && kickers) {
        playerId = `k-${seat + 1}`;
      } else if (roundsFromEnd === 1 && defenses) {
        playerId = `dst-${seat + 1}`;
      } else {
        playerId = skillPool[index++];
      }
      if (!playerId) return;
      const entry: RosterEntry = { playerId, slot: 'BENCH', acquisitionType: 'DRAFT' };
      team.roster.push(entry);
    });
  }
}

/**
 * Put the sample rosters into starting slots.
 *
 * Real providers report a lineup, so the sample must too — otherwise every screen reports
 * "no lineup set", which is a genuine state but not a useful default for exploring the app.
 * Deliberately imperfect: it fills by draft order rather than by projection, so the lineup
 * optimiser still has real changes to recommend.
 */
export function assignSampleLineup(team: FantasyTeam): void {
  const slotPlan: Array<{ slot: RosterEntry['slot']; eligible: Position[] }> = [
    { slot: 'QB', eligible: ['QB'] },
    { slot: 'QB', eligible: ['QB'] },
    { slot: 'RB', eligible: ['RB'] },
    { slot: 'RB', eligible: ['RB'] },
    { slot: 'WR', eligible: ['WR'] },
    { slot: 'WR', eligible: ['WR'] },
    { slot: 'TE', eligible: ['TE'] },
    { slot: 'FLEX', eligible: ['RB', 'WR', 'TE'] },
    { slot: 'K', eligible: ['K'] },
    { slot: 'DST', eligible: ['DST'] },
  ];

  const used = new Set<string>();
  for (const plan of slotPlan) {
    const entry = team.roster.find(
      (candidate) =>
        !used.has(candidate.playerId) &&
        plan.eligible.includes(positionOfSampleId(candidate.playerId)),
    );
    if (!entry) continue;
    used.add(entry.playerId);
    entry.slot = plan.slot;
  }
}

/** Sample ids encode their position, e.g. "rb-12". */
export function positionOfSampleId(playerId: string): Position {
  const prefix = playerId.split('-')[0]?.toUpperCase() ?? 'WR';
  return (POSITIONS as readonly string[]).includes(prefix) ? (prefix as Position) : 'WR';
}

/** Players ordered roughly as they would come off the board in a 2-QB 0.5-PPR league. */
export function orderedSamplePool(): string[] {
  const entries: Array<{ id: string; score: number }> = [];
  for (const spec of POSITION_SPECS) {
    for (let i = 0; i < spec.count; i++) {
      const points = samplePointsAtRank(spec, i + 1);
      // Crude positional adjustment purely for ordering the sample draft.
      const positionalBias =
        spec.position === 'QB' ? 0.92 : spec.position === 'K' || spec.position === 'DST' ? 0.35 : 1;
      entries.push({ id: `${spec.position.toLowerCase()}-${i + 1}`, score: points * positionalBias });
    }
  }
  return entries.sort((a, b) => b.score - a.score).map((e) => e.id);
}

export function buildSampleLeagueState(
  options: { drafted?: boolean; currentWeek?: number } = {},
): LeagueState {
  const players = buildSamplePlayers();
  return {
    config: { ...DEFAULT_LEAGUE_CONFIG, id: 'sample', name: 'Sample League', season: 2026 },
    teams: buildSampleTeams({ drafted: options.drafted }),
    players,
    seasonProjections: buildSampleProjections(),
    weeklyProjections: [],
    injuries: [],
    adp: [],
    matchups: [],
    currentWeek: options.currentWeek ?? 0,
  };
}
