import { round2 } from './scoring';
import type { LeagueConfig, LineupSlot, Position, RosterEntry } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * Optimal starting lineup solver.
 *
 * Greedy fill in slot-scarcity order: dedicated slots first (they accept the fewest
 * positions), then FLEX, then SUPERFLEX. Because dedicated slots are strictly more
 * constrained than flex slots, filling them first with the best eligible player is
 * optimal here — a flex slot can always take whoever the dedicated slots left behind.
 */

export interface LineupAssignment {
  slot: LineupSlot;
  playerId: string | null;
  points: number;
}

export interface OptimalLineup {
  assignments: LineupAssignment[];
  startersPoints: number;
  benchPoints: number;
  benchPlayerIds: string[];
  /** Slots that could not be filled — a genuine roster hole, not a zero. */
  unfilledSlots: LineupSlot[];
}

interface SlotSpec {
  slot: LineupSlot;
  eligible: readonly Position[];
}

export function slotSpecs(config: LeagueConfig): SlotSpec[] {
  const specs: SlotSpec[] = [];
  const push = (slot: LineupSlot, count: number, eligible: readonly Position[]) => {
    for (let i = 0; i < count; i++) specs.push({ slot, eligible });
  };

  push('QB', config.lineup.QB, ['QB']);
  push('RB', config.lineup.RB, ['RB']);
  push('WR', config.lineup.WR, ['WR']);
  push('TE', config.lineup.TE, ['TE']);
  push('K', config.lineup.K, ['K']);
  push('DST', config.lineup.DST, ['DST']);
  push('FLEX', config.lineup.FLEX, config.flexEligibility);
  push('SUPERFLEX', config.lineup.SUPERFLEX, config.superflexEligibility);

  return specs;
}

export function optimalLineup(
  config: LeagueConfig,
  roster: RosterEntry[],
  values: Map<string, ValuedPlayer>,
  options: { excludePlayerIds?: Set<string> } = {},
): OptimalLineup {
  const exclude = options.excludePlayerIds ?? new Set<string>();
  const available = roster
    .filter((entry) => entry.slot !== 'IR' && !exclude.has(entry.playerId))
    .map((entry) => values.get(entry.playerId))
    .filter((v): v is ValuedPlayer => v !== undefined)
    .sort((a, b) => b.projectedPoints - a.projectedPoints);

  const used = new Set<string>();
  const assignments: LineupAssignment[] = [];
  const unfilled: LineupSlot[] = [];

  for (const spec of slotSpecs(config)) {
    const pick = available.find(
      (p) => !used.has(p.player.id) && spec.eligible.includes(p.player.position),
    );
    if (pick) {
      used.add(pick.player.id);
      assignments.push({ slot: spec.slot, playerId: pick.player.id, points: pick.projectedPoints });
    } else {
      assignments.push({ slot: spec.slot, playerId: null, points: 0 });
      unfilled.push(spec.slot);
    }
  }

  const bench = available.filter((p) => !used.has(p.player.id));

  return {
    assignments,
    startersPoints: round2(assignments.reduce((sum, a) => sum + a.points, 0)),
    benchPoints: round2(bench.reduce((sum, p) => sum + p.projectedPoints, 0)),
    benchPlayerIds: bench.map((p) => p.player.id),
    unfilledSlots: unfilled,
  };
}

/**
 * Marginal value of adding a player to a roster: how much the optimal starting lineup
 * improves. This is what "roster fit" actually means — a 4th good RB adds far less than a
 * 1st good TE, even if their raw values are identical.
 */
export function marginalLineupGain(
  config: LeagueConfig,
  roster: RosterEntry[],
  values: Map<string, ValuedPlayer>,
  candidate: ValuedPlayer,
): number {
  const before = optimalLineup(config, roster, values).startersPoints;
  const withCandidate: RosterEntry[] = [
    ...roster,
    { playerId: candidate.player.id, slot: 'BENCH' },
  ];
  const augmented = new Map(values);
  augmented.set(candidate.player.id, candidate);
  const after = optimalLineup(config, withCandidate, augmented).startersPoints;
  return round2(after - before);
}

/** Which lineup slots a roster currently cannot fill from its own players. */
export function unfilledStartingSlots(
  config: LeagueConfig,
  roster: RosterEntry[],
  values: Map<string, ValuedPlayer>,
): LineupSlot[] {
  return optimalLineup(config, roster, values).unfilledSlots;
}

/**
 * Bye-week exposure: for each week, how many starting slots the roster cannot fill
 * because of byes. Returns weeks with at least one hole.
 */
export function byeWeekExposure(
  config: LeagueConfig,
  roster: RosterEntry[],
  values: Map<string, ValuedPlayer>,
  byeWeekByPlayer: Map<string, number | undefined>,
): Array<{ week: number; holes: number; playerIds: string[] }> {
  const weeks = new Map<number, string[]>();
  for (const entry of roster) {
    const bye = byeWeekByPlayer.get(entry.playerId);
    if (bye === undefined) continue;
    weeks.set(bye, [...(weeks.get(bye) ?? []), entry.playerId]);
  }

  const exposure: Array<{ week: number; holes: number; playerIds: string[] }> = [];
  for (const [week, playerIds] of weeks) {
    const lineup = optimalLineup(config, roster, values, {
      excludePlayerIds: new Set(playerIds),
    });
    if (lineup.unfilledSlots.length > 0) {
      exposure.push({ week, holes: lineup.unfilledSlots.length, playerIds });
    }
  }
  return exposure.sort((a, b) => b.holes - a.holes);
}
