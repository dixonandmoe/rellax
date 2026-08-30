import { explained, type Explained } from './explain';
import { optimalLineup } from './lineup';
import { round2 } from './scoring';
import type { FantasyTeam, LeagueConfig, RosterEntry } from './types';
import { INJURY_FACTORS, type ValuedPlayer } from './valuation';

/**
 * Two-sided trade evaluation.
 *
 * The only measure that matters is the change in each team's *optimal starting lineup*,
 * not the sum of the players' values. Trading your RB3 for someone's RB1 is a win even if
 * the raw values look close, because your RB3 was never starting.
 */

export interface TradeSide {
  teamId: string;
  /** Player ids this team gives up. */
  sends: string[];
  /** Player ids this team receives. */
  receives: string[];
}

export interface SideEvaluation {
  teamId: string;
  teamName: string;
  starterPointsBefore: number;
  starterPointsAfter: number;
  starterDelta: number;
  starterDeltaPct: number;
  benchPointsBefore: number;
  benchPointsAfter: number;
  benchDelta: number;
  /** Positions this side got materially worse at. */
  weakened: string[];
  /** Positions this side got materially better at. */
  strengthened: string[];
  /** Does this side end up unable to fill a starting slot? */
  createsHole: string[];
  injuryRiskDelta: number;
}

export interface TradeEvaluation {
  sides: [SideEvaluation, SideEvaluation];
  winner: 'PROPOSER' | 'RECEIVER' | 'EVEN';
  /** Would a rational manager on the other side accept? */
  realistic: boolean;
  verdict: 'ACCEPT' | 'REJECT' | 'NEGOTIATE';
  reasoning: string[];
  explain: Explained<string>;
}

/** A starter delta smaller than this is noise, not an edge. */
export const TRADE_NOISE_THRESHOLD_PCT = 1.5;

export function evaluateTrade(
  config: LeagueConfig,
  proposer: FantasyTeam,
  receiver: FantasyTeam,
  /** Players the proposer sends to the receiver. */
  proposerSends: string[],
  /** Players the proposer receives from the receiver. */
  proposerReceives: string[],
  values: Map<string, ValuedPlayer>,
): TradeEvaluation {
  const proposerAfter = applyTrade(proposer.roster, proposerSends, proposerReceives);
  const receiverAfter = applyTrade(receiver.roster, proposerReceives, proposerSends);

  const proposerEval = evaluateSide(config, proposer, proposerAfter, proposerSends, proposerReceives, values);
  const receiverEval = evaluateSide(config, receiver, receiverAfter, proposerReceives, proposerSends, values);

  const gap = proposerEval.starterDeltaPct - receiverEval.starterDeltaPct;
  const winner: TradeEvaluation['winner'] =
    Math.abs(gap) < TRADE_NOISE_THRESHOLD_PCT
      ? 'EVEN'
      : gap > 0
        ? 'PROPOSER'
        : 'RECEIVER';

  // Realistic means: both sides improve, or one improves while the other is at worst
  // roughly neutral. A trade the other manager clearly loses will simply be declined.
  const realistic =
    receiverEval.starterDeltaPct > -TRADE_NOISE_THRESHOLD_PCT &&
    proposerEval.starterDeltaPct > -TRADE_NOISE_THRESHOLD_PCT;

  const verdict: TradeEvaluation['verdict'] =
    proposerEval.starterDeltaPct >= TRADE_NOISE_THRESHOLD_PCT && proposerEval.createsHole.length === 0
      ? 'ACCEPT'
      : proposerEval.starterDeltaPct <= -TRADE_NOISE_THRESHOLD_PCT || proposerEval.createsHole.length > 0
        ? 'REJECT'
        : 'NEGOTIATE';

  const reasoning: string[] = [];
  reasoning.push(
    `${proposer.name}'s optimal starting lineup moves ${signed(proposerEval.starterDelta)} projected points (${signed(proposerEval.starterDeltaPct)}%).`,
  );
  reasoning.push(
    `${receiver.name}'s moves ${signed(receiverEval.starterDelta)} (${signed(receiverEval.starterDeltaPct)}%).`,
  );
  if (proposerEval.strengthened.length > 0) {
    reasoning.push(`You get stronger at ${proposerEval.strengthened.join(', ')}.`);
  }
  if (proposerEval.weakened.length > 0) {
    reasoning.push(`You get thinner at ${proposerEval.weakened.join(', ')}.`);
  }
  if (proposerEval.createsHole.length > 0) {
    reasoning.push(
      `⚠️ After this trade you cannot fill ${proposerEval.createsHole.join(', ')} from your roster.`,
    );
  }
  if (!realistic) {
    reasoning.push(
      'The other manager loses starting-lineup points here, so realistically they decline. Rebalance it before offering.',
    );
  }

  return {
    sides: [proposerEval, receiverEval],
    winner,
    realistic,
    verdict,
    reasoning,
    explain: explained(
      verdict,
      {
        proposerStarterDelta: proposerEval.starterDelta,
        proposerStarterDeltaPct: proposerEval.starterDeltaPct,
        receiverStarterDelta: receiverEval.starterDelta,
        receiverStarterDeltaPct: receiverEval.starterDeltaPct,
        noiseThresholdPct: TRADE_NOISE_THRESHOLD_PCT,
        realistic,
      },
      `Compared optimal starting lineups before and after for both rosters under ` +
        `${config.lineup.QB}QB/${config.lineup.RB}RB/${config.lineup.WR}WR/${config.lineup.TE}TE/${config.lineup.FLEX}FLEX. ` +
        `Deltas: proposer ${signed(proposerEval.starterDeltaPct)}%, receiver ${signed(receiverEval.starterDeltaPct)}%.`,
      ['projections', 'rosters', 'league-config'],
    ),
  };
}

function evaluateSide(
  config: LeagueConfig,
  team: FantasyTeam,
  afterRoster: RosterEntry[],
  sends: string[],
  receives: string[],
  values: Map<string, ValuedPlayer>,
): SideEvaluation {
  const before = optimalLineup(config, team.roster, values);
  const after = optimalLineup(config, afterRoster, values);

  const positionDelta = new Map<string, number>();
  for (const id of receives) {
    const value = values.get(id);
    if (!value) continue;
    positionDelta.set(
      value.player.position,
      (positionDelta.get(value.player.position) ?? 0) + value.projectedPoints,
    );
  }
  for (const id of sends) {
    const value = values.get(id);
    if (!value) continue;
    positionDelta.set(
      value.player.position,
      (positionDelta.get(value.player.position) ?? 0) - value.projectedPoints,
    );
  }

  const strengthened: string[] = [];
  const weakened: string[] = [];
  for (const [position, delta] of positionDelta) {
    if (delta > 5) strengthened.push(position);
    else if (delta < -5) weakened.push(position);
  }

  const injuryBefore = injuryExposure(team.roster, values);
  const injuryAfter = injuryExposure(afterRoster, values);

  const deltaPct =
    before.startersPoints > 0
      ? round2(((after.startersPoints - before.startersPoints) / before.startersPoints) * 100)
      : 0;

  return {
    teamId: team.id,
    teamName: team.name,
    starterPointsBefore: before.startersPoints,
    starterPointsAfter: after.startersPoints,
    starterDelta: round2(after.startersPoints - before.startersPoints),
    starterDeltaPct: deltaPct,
    benchPointsBefore: before.benchPoints,
    benchPointsAfter: after.benchPoints,
    benchDelta: round2(after.benchPoints - before.benchPoints),
    weakened,
    strengthened,
    createsHole: after.unfilledSlots.filter((slot) => !before.unfilledSlots.includes(slot)),
    injuryRiskDelta: round2(injuryAfter - injuryBefore),
  };
}

export function applyTrade(
  roster: RosterEntry[],
  outgoing: string[],
  incoming: string[],
): RosterEntry[] {
  const out = new Set(outgoing);
  const kept = roster.filter((entry) => !out.has(entry.playerId));
  return [
    ...kept,
    ...incoming.map((playerId): RosterEntry => ({ playerId, slot: 'BENCH', acquisitionType: 'TRADE' })),
  ];
}

function injuryExposure(roster: RosterEntry[], values: Map<string, ValuedPlayer>): number {
  return roster.reduce((sum, entry) => {
    const value = values.get(entry.playerId);
    if (!value) return sum;
    return sum + (1 - (INJURY_FACTORS[value.player.status] ?? 1));
  }, 0);
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
