import { round2 } from './scoring';
import { evaluateTrade, type TradeEvaluation } from './trade';
import type { TeamNeedsReport } from './team-needs';
import type { FantasyTeam, LeagueConfig, Position } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * Trade target finder + partner motivation model.
 *
 * The goal is explicitly *mutually beneficial* trades: we search for pairs where one team
 * has surplus at a position the other needs, in both directions, and only surface offers
 * where both sides' starting lineups improve. A proposal the other manager loses is
 * worthless — it just gets declined.
 */

export interface TradeIdea {
  partnerTeamId: string;
  partnerTeamName: string;
  /** Players I would receive. */
  receive: ValuedPlayer[];
  /** Players I would send. */
  send: ValuedPlayer[];
  evaluation: TradeEvaluation;
  /** Why the partner would say yes. */
  partnerMotivation: string;
  myGain: number;
  partnerGain: number;
  fairnessScore: number;
  reasoning: string[];
}

export interface TradeFinderOptions {
  /** Max players on each side. */
  maxPerSide?: number;
  /** How many ideas to return. */
  limit?: number;
  /** Only consider partners with this trade stance. */
  stances?: Array<'BUY' | 'SELL' | 'STAND_PAT'>;
}

export function findTradeTargets(
  config: LeagueConfig,
  myTeam: FantasyTeam,
  teams: FantasyTeam[],
  values: Map<string, ValuedPlayer>,
  needsByTeam: Map<string, TeamNeedsReport>,
  options: TradeFinderOptions = {},
): TradeIdea[] {
  const { maxPerSide = 2, limit = 6 } = options;
  const myNeeds = needsByTeam.get(myTeam.id);
  if (!myNeeds) return [];

  const ideas: TradeIdea[] = [];

  for (const partner of teams) {
    if (partner.id === myTeam.id) continue;
    const partnerNeeds = needsByTeam.get(partner.id);
    if (!partnerNeeds) continue;
    if (options.stances && !options.stances.includes(partnerNeeds.tradeStance)) continue;

    // What can I get? Positions I need where they have surplus.
    const targetPositions = myNeeds.needOrder.filter(
      (position) => partnerNeeds.surplus.includes(position),
    );
    // What can I give? Positions they need where I have surplus.
    const offerPositions = partnerNeeds.needOrder.filter(
      (position) => myNeeds.surplus.includes(position),
    );

    if (targetPositions.length === 0 || offerPositions.length === 0) continue;

    for (const targetPosition of targetPositions.slice(0, 2)) {
      for (const offerPosition of offerPositions.slice(0, 2)) {
        const targets = rosterAt(partner, values, targetPosition).slice(0, 3);
        const offers = rosterAt(myTeam, values, offerPosition).slice(0, 4);
        if (targets.length === 0 || offers.length === 0) continue;

        for (const target of targets) {
          // Find the smallest package that makes the partner better off.
          for (let size = 1; size <= Math.min(maxPerSide, offers.length); size++) {
            const packages = combinations(offers, size);
            for (const offerPackage of packages) {
              const evaluation = evaluateTrade(
                config,
                myTeam,
                partner,
                offerPackage.map((p) => p.player.id),
                [target.player.id],
                values,
              );

              const [mine, theirs] = evaluation.sides;
              if (mine.starterDelta <= 0 || theirs.starterDelta <= 0) continue;
              if (mine.createsHole.length > 0 || theirs.createsHole.length > 0) continue;

              ideas.push({
                partnerTeamId: partner.id,
                partnerTeamName: partner.name,
                receive: [target],
                send: offerPackage,
                evaluation,
                partnerMotivation: describeMotivation(partner, partnerNeeds, offerPosition, targetPosition),
                myGain: mine.starterDelta,
                partnerGain: theirs.starterDelta,
                fairnessScore: round2(
                  100 - Math.min(100, Math.abs(mine.starterDeltaPct - theirs.starterDeltaPct) * 6),
                ),
                reasoning: [
                  `${partner.name} is ${partnerNeeds.tradeStance === 'BUY' ? 'buying' : partnerNeeds.tradeStance === 'SELL' ? 'selling' : 'standing pat'} and has surplus at ${targetPosition}.`,
                  `${targetPosition} is ${describeNeedRank(myNeeds, targetPosition)} on your need list.`,
                  `You gain ${mine.starterDelta} starting points; they gain ${theirs.starterDelta}. Both lineups improve, so this is a realistic offer.`,
                ],
              });
              break; // smallest working package for this target
            }
          }
        }
      }
    }
  }

  return ideas
    .sort((a, b) => b.myGain * 0.7 + b.fairnessScore * 0.3 - (a.myGain * 0.7 + a.fairnessScore * 0.3))
    .slice(0, limit);
}

function describeMotivation(
  partner: FantasyTeam,
  needs: TeamNeedsReport,
  offerPosition: Position,
  targetPosition: Position,
): string {
  const needPct = Math.round((needs.needByPosition[offerPosition] ?? 0) * 100);
  return (
    `${partner.name} carries surplus ${targetPosition} depth that never reaches their starting lineup, ` +
    `while ${offerPosition} is a ${needPct}% need for them. They are a ${needs.tradeStance.toLowerCase().replace('_', ' ')} team.`
  );
}

function describeNeedRank(needs: TeamNeedsReport, position: Position): string {
  const index = needs.needOrder.indexOf(position);
  if (index === 0) return 'your single biggest hole';
  if (index === 1) return 'your second-biggest hole';
  if (index < 0) return 'not currently a hole';
  return `#${index + 1}`;
}

function rosterAt(
  team: FantasyTeam,
  values: Map<string, ValuedPlayer>,
  position: Position,
): ValuedPlayer[] {
  return team.roster
    .map((entry) => values.get(entry.playerId))
    .filter((v): v is ValuedPlayer => v?.player.position === position)
    .sort((a, b) => b.projectedPoints - a.projectedPoints);
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (size > items.length) return [];
  const result: T[][] = [];
  const recurse = (start: number, current: T[]) => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]!);
      recurse(i + 1, current);
      current.pop();
    }
  };
  recurse(0, []);
  return result;
}
