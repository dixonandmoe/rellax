import { explained, type Explained } from './explain';
import { marginalLineupGain } from './lineup';
import { round2 } from './scoring';
import type { PositionScarcity } from './scarcity';
import type { TeamNeedsReport } from './team-needs';
import type { FantasyTeam, LeagueConfig } from './types';
import type { ValuedPlayer } from './valuation';

/**
 * FAAB bid engine.
 *
 * A bid is not a function of a player's value. It is a function of what he is worth
 * *to your roster*, how many weeks are left to use the budget, how much budget you and
 * your rivals have, and how many rivals actually want him. Two managers should bid very
 * different amounts on the same player.
 */

export interface CompetitorAssessment {
  teamId: string;
  teamName: string;
  faabRemaining: number;
  needScore: number;
  /** HIGH | MEDIUM | LOW likelihood of bidding. */
  threat: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Estimated maximum they would spend. */
  estimatedMaxBid: number;
}

export interface WaiverRecommendation {
  player: ValuedPlayer;
  recommendedBid: number;
  bidRangeLow: number;
  bidRangeHigh: number;
  aggressiveBid: number;
  /** 0-100 how much this player helps YOUR roster. */
  rosterImpact: number;
  marginalStarterGain: number;
  competitors: CompetitorAssessment[];
  expectedCompetition: 'HIGH' | 'MEDIUM' | 'LOW';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  isRentalOnly: boolean;
  reasoning: string[];
  explain: Explained<number>;
}

export interface FaabContext {
  config: LeagueConfig;
  myTeam: FantasyTeam;
  teams: FantasyTeam[];
  values: Map<string, ValuedPlayer>;
  needsByTeam: Map<string, TeamNeedsReport>;
  scarcity: Map<string, PositionScarcity>;
  currentWeek: number;
}

/**
 * Share of remaining budget a single must-have player is worth.
 *
 * Real FAAB markets clear well below "value" because budget has option value: you may
 * need it later. 35% of remaining budget is the ceiling for a genuine starter upgrade;
 * a season-long RB1 breakout justifies going past it, which is the aggressive number.
 */
export const MAX_BUDGET_SHARE = 0.35;

/**
 * Half-saturation point for the roster-impact curve, in points per week.
 *
 * Impact must not be a hard cap: with a linear cap an elite starter and a body who
 * merely fills an empty slot both peg the maximum and get identical bids. A saturating
 * curve keeps them separated at every magnitude — a +23 pts/week upgrade always scores
 * above a +5 pts/week one.
 */
export const IMPACT_HALF_SATURATION_PPG = 6;

export function recommendBid(
  context: FaabContext,
  candidate: ValuedPlayer,
): WaiverRecommendation {
  const { config, myTeam, teams, values, needsByTeam, currentWeek } = context;

  const marginal = marginalLineupGain(config, myTeam.roster, values, candidate);
  const myNeeds = needsByTeam.get(myTeam.id);
  const positionNeed = myNeeds?.needByPosition[candidate.player.position] ?? 0;

  // Weeks the player can still help, including playoffs.
  const lastWeek = Math.max(config.regularSeasonWeeks, ...config.playoffWeeks);
  const weeksRemaining = Math.max(1, lastWeek - currentWeek);
  const seasonShare = weeksRemaining / Math.max(1, lastWeek);

  // Roster impact: marginal starting-lineup gain converted to points per week, run
  // through a saturating curve, plus how badly you need the position, scaled by how much
  // of the season is left to collect the benefit.
  const marginalPerWeek = marginal / Math.max(1, lastWeek);
  const gainComponent =
    60 * (marginalPerWeek / (marginalPerWeek + IMPACT_HALF_SATURATION_PPG));
  const rosterImpact = round2(
    clamp(Math.max(0, gainComponent) + positionNeed * 40, 0, 100) * (0.6 + 0.4 * seasonShare),
  );

  // Competition model.
  const competitors: CompetitorAssessment[] = teams
    .filter((t) => t.id !== myTeam.id)
    .map((team) => {
      const needs = needsByTeam.get(team.id);
      const need = needs?.needByPosition[candidate.player.position] ?? 0;
      const budgetShare = config.faabBudget > 0 ? team.faabRemaining / config.faabBudget : 0;
      const threatScore = need * 0.65 + budgetShare * 0.35;
      const threat: CompetitorAssessment['threat'] =
        threatScore > 0.55 ? 'HIGH' : threatScore > 0.3 ? 'MEDIUM' : 'LOW';
      return {
        teamId: team.id,
        teamName: team.name,
        faabRemaining: team.faabRemaining,
        needScore: round2(need),
        threat,
        estimatedMaxBid: Math.round(team.faabRemaining * MAX_BUDGET_SHARE * clamp(need * 1.4, 0, 1)),
      };
    })
    .sort((a, b) => b.estimatedMaxBid - a.estimatedMaxBid);

  const highThreats = competitors.filter((c) => c.threat === 'HIGH').length;
  const expectedCompetition: WaiverRecommendation['expectedCompetition'] =
    highThreats >= 3 ? 'HIGH' : highThreats >= 1 ? 'MEDIUM' : 'LOW';

  // Base bid: share of MY remaining budget justified by roster impact.
  const baseShare = (rosterImpact / 100) * MAX_BUDGET_SHARE;
  let bid = myTeam.faabRemaining * baseShare;

  // Beat the field: if a rival's estimated max exceeds our base, we must go past it to
  // win — but only if the player is worth it to us.
  const topRivalBid = competitors[0]?.estimatedMaxBid ?? 0;
  if (rosterImpact >= 55 && topRivalBid > bid) {
    bid = Math.min(topRivalBid + 2, myTeam.faabRemaining * MAX_BUDGET_SHARE * 1.4);
  }

  // Budget pacing: don't spend late-season budget as if it were week 2 budget, and don't
  // sit on a full budget in week 12.
  const pacingFactor = 0.85 + 0.35 * (1 - seasonShare);
  bid *= pacingFactor;

  const recommendedBid = Math.max(0, Math.round(clamp(bid, 0, myTeam.faabRemaining)));
  const low = Math.max(0, Math.round(recommendedBid * 0.72));
  const high = Math.min(myTeam.faabRemaining, Math.round(recommendedBid * 1.25));
  const aggressive = Math.min(myTeam.faabRemaining, Math.round(recommendedBid * 1.5) + 2);

  const isRentalOnly = weeksRemaining <= 3 || (positionNeed < 0.2 && marginal < 1);

  const priority: WaiverRecommendation['priority'] =
    rosterImpact >= 65 ? 'HIGH' : rosterImpact >= 35 ? 'MEDIUM' : 'LOW';

  const reasoning: string[] = [];
  if (marginal > 0) {
    reasoning.push(
      `Adding him improves your optimal starting lineup by ${marginal} projected points.`,
    );
  } else {
    reasoning.push('He does not crack your starting lineup today — this is a depth/upside bid.');
  }
  if (positionNeed > 0.35) {
    reasoning.push(
      `${candidate.player.position} is one of your weaker positions (${Math.round(positionNeed * 100)}% need).`,
    );
  }
  reasoning.push(
    `${competitors.filter((c) => c.threat !== 'LOW').length} of ${teams.length - 1} rivals plausibly bid; ` +
      `the biggest threat can spend up to about $${topRivalBid}.`,
  );
  reasoning.push(
    `You have $${myTeam.faabRemaining} of $${config.faabBudget} left with ${weeksRemaining} weeks to use it.`,
  );
  if (isRentalOnly) {
    reasoning.push('Treat him as a short-term rental, not a season-long asset — cap the bid accordingly.');
  }

  return {
    player: candidate,
    recommendedBid,
    bidRangeLow: low,
    bidRangeHigh: high,
    aggressiveBid: aggressive,
    rosterImpact,
    marginalStarterGain: marginal,
    competitors,
    expectedCompetition,
    priority,
    isRentalOnly,
    reasoning,
    explain: explained(
      recommendedBid,
      {
        rosterImpact,
        marginalStarterGain: marginal,
        positionNeed: round2(positionNeed),
        myFaabRemaining: myTeam.faabRemaining,
        topRivalEstimatedMax: topRivalBid,
        weeksRemaining,
        marginalPointsPerWeek: round2(marginalPerWeek),
        pacingFactor: round2(pacingFactor),
      },
      `impact = 60×(${round2(marginalPerWeek)} ppg ÷ (${round2(marginalPerWeek)} + ${IMPACT_HALF_SATURATION_PPG})) + 40×need(${round2(positionNeed)}) = ${rosterImpact}/100; ` +
        `bid = $${myTeam.faabRemaining} × ${round2(baseShare)} (impact × max share ${MAX_BUDGET_SHARE}) ` +
        `× pacing ${round2(pacingFactor)}${topRivalBid > 0 ? `, floored by top rival max $${topRivalBid}` : ''} = $${recommendedBid}`,
      ['projections', 'rosters', 'faab-balances', 'league-config'],
    ),
  };
}

/** Rank a waiver pool for my team. */
export function rankWaiverTargets(
  context: FaabContext,
  candidates: ValuedPlayer[],
  limit = 10,
): WaiverRecommendation[] {
  return candidates
    .map((candidate) => recommendBid(context, candidate))
    .sort((a, b) => b.rosterImpact - a.rosterImpact)
    .slice(0, limit);
}

/** League-wide FAAB picture, for the strategy view. */
export interface FaabStatus {
  teamId: string;
  teamName: string;
  remaining: number;
  sharePct: number;
  isMyTeam: boolean;
}

export function faabStatus(config: LeagueConfig, teams: FantasyTeam[]): FaabStatus[] {
  return teams
    .map((team) => ({
      teamId: team.id,
      teamName: team.name,
      remaining: team.faabRemaining,
      sharePct: config.faabBudget > 0 ? round2((team.faabRemaining / config.faabBudget) * 100) : 0,
      isMyTeam: team.isMyTeam,
    }))
    .sort((a, b) => b.remaining - a.remaining);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
