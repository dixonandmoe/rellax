import { rankWaiverTargets, type FaabContext, type WaiverRecommendation } from './faab';
import { optimalLineup } from './lineup';
import { computeScarcity, type PositionScarcity } from './scarcity';
import { round2 } from './scoring';
import { computeTeamNeeds, type TeamNeedsReport } from './team-needs';
import { gradeTeam, type TeamGrade } from './team-grade';
import { findTradeTargets, type TradeIdea } from './trade-finder';
import type { LeagueState } from './types';
import { indexByPlayer, valuePlayers, type ValuedPlayer } from './valuation';

/**
 * The "WHAT SHOULD I DO?" engine — the central philosophy of the app.
 *
 * Takes the entire league state and returns a small, ranked set of concrete actions. It
 * deliberately returns *few* actions: a list of twenty things to consider is the same as
 * no advice at all.
 */

export type ActionKind =
  | 'WAIVER_CLAIM'
  | 'TRADE_OFFER'
  | 'LINEUP_CHANGE'
  | 'HOLD_FAAB'
  | 'DRAFT_PICK'
  | 'ROSTER_HOLE'
  | 'BYE_WEEK_PREP';

export interface RecommendedAction {
  kind: ActionKind;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  headline: string;
  detail: string;
  reasoning: string[];
  confidence: number;
  /** Expected starting-lineup points gained if taken. */
  expectedGain: number | null;
  risk: string | null;
  alternative: string | null;
  dataUsed: string[];
}

export interface WeeklyReport {
  week: number;
  grade: TeamGrade;
  startersProjection: number;
  lineupChanges: Array<{ startPlayerId: string; benchPlayerId: string; gain: number }>;
  /** False when no player occupies a starting slot on my roster. */
  lineupIsSet: boolean;
  actions: RecommendedAction[];
  needs: TeamNeedsReport | null;
  waiverTargets: WaiverRecommendation[];
  tradeIdeas: TradeIdea[];
  dataWarnings: string[];
}

export function buildWeeklyReport(
  state: LeagueState,
  options: { week?: number; freeAgentIds?: string[] } = {},
): WeeklyReport {
  const { config, teams, players, seasonProjections, injuries } = state;
  const week = options.week ?? state.currentWeek ?? 1;

  const valuation = valuePlayers(config, players, seasonProjections, { injuries });
  const values = indexByPlayer(valuation);
  const myTeam = teams.find((t) => t.isMyTeam) ?? teams[0];

  const dataWarnings: string[] = [];
  if (valuation.missingProjections.length > 0) {
    dataWarnings.push(
      `${valuation.missingProjections.length} of ${players.length} players have no projection — they are excluded from every calculation, not treated as zero.`,
    );
  }

  if (!myTeam) {
    return {
      week,
      grade: emptyGrade(),
      startersProjection: 0,
      lineupChanges: [],
      lineupIsSet: false,
      actions: [],
      needs: null,
      waiverTargets: [],
      tradeIdeas: [],
      dataWarnings: [...dataWarnings, 'No teams loaded. Connect ESPN or import a league.'],
    };
  }

  const needsByTeam = new Map<string, TeamNeedsReport>();
  for (const team of teams) {
    needsByTeam.set(team.id, computeTeamNeeds(config, team, values, valuation.players));
  }
  const myNeeds = needsByTeam.get(myTeam.id) ?? null;
  const grade = gradeTeam(config, myTeam, teams, values, valuation.players);

  // Lineup changes: compare the optimal lineup to the one currently set.
  const optimal = optimalLineup(config, myTeam.roster, values);
  const optimalIds = new Set(
    optimal.assignments.map((a) => a.playerId).filter((id): id is string => Boolean(id)),
  );
  const currentStarterIds = new Set(
    myTeam.roster.filter((r) => r.slot !== 'BENCH' && r.slot !== 'IR').map((r) => r.playerId),
  );

  // A roster with nothing in a starting slot has no lineup set at all. That is a
  // different problem from a suboptimal lineup, and pairing optimal starters against
  // nobody would produce nonsense swaps ("start X over <nobody>, +350 points").
  const lineupIsSet = currentStarterIds.size > 0;

  const shouldStart = [...optimalIds].filter((id) => !currentStarterIds.has(id));
  const shouldSit = [...currentStarterIds].filter((id) => !optimalIds.has(id));

  // Pair each promotion with the demotion it displaces. Best incoming player against the
  // worst outgoing one, which is the swap a manager would actually make.
  const byPointsDesc = (a: string, b: string) =>
    (values.get(b)?.projectedPoints ?? 0) - (values.get(a)?.projectedPoints ?? 0);
  const promotions = [...shouldStart].sort(byPointsDesc);
  const demotions = [...shouldSit].sort((a, b) => byPointsDesc(b, a));

  const lineupChanges = lineupIsSet
    ? promotions.slice(0, demotions.length).map((startId, index) => {
        const benchId = demotions[index]!;
        return {
          startPlayerId: startId,
          benchPlayerId: benchId,
          gain: round2(
            (values.get(startId)?.projectedPoints ?? 0) -
              (values.get(benchId)?.projectedPoints ?? 0),
          ),
        };
      })
    : [];

  // Waiver targets from the free-agent pool.
  const rosteredIds = new Set(teams.flatMap((t) => t.roster.map((r) => r.playerId)));
  const freeAgentIds = new Set(
    options.freeAgentIds ?? players.filter((p) => !rosteredIds.has(p.id)).map((p) => p.id),
  );
  const freeAgents = valuation.players.filter((v) => freeAgentIds.has(v.player.id));

  const rosterPositions = new Map(players.map((p) => [p.id, p.position]));
  const scarcity = computeScarcity(config, freeAgents, teams, rosterPositions);
  const scarcityByKey = new Map<string, PositionScarcity>(scarcity);

  const faabContext: FaabContext = {
    config,
    myTeam,
    teams,
    values,
    needsByTeam,
    scarcity: scarcityByKey,
    currentWeek: week,
  };
  const waiverTargets = config.waiverType === 'FAAB' ? rankWaiverTargets(faabContext, freeAgents, 6) : [];

  const tradeIdeas = findTradeTargets(config, myTeam, teams, values, needsByTeam, { limit: 4 });

  const actions = rankActions({
    week,
    config,
    grade,
    myNeeds,
    lineupChanges,
    waiverTargets,
    tradeIdeas,
    values,
    myFaabRemaining: myTeam.faabRemaining,
    unfilledSlots: optimal.unfilledSlots,
    lineupIsSet,
  });

  return {
    week,
    grade,
    startersProjection: optimal.startersPoints,
    lineupChanges,
    lineupIsSet,
    actions,
    needs: myNeeds,
    waiverTargets,
    tradeIdeas,
    dataWarnings,
  };
}

interface RankInput {
  week: number;
  config: LeagueState['config'];
  grade: TeamGrade;
  myNeeds: TeamNeedsReport | null;
  lineupChanges: Array<{ startPlayerId: string; benchPlayerId: string; gain: number }>;
  waiverTargets: WaiverRecommendation[];
  tradeIdeas: TradeIdea[];
  values: Map<string, ValuedPlayer>;
  myFaabRemaining: number;
  unfilledSlots: string[];
  /** False when no player is in a starting slot — the lineup has never been set. */
  lineupIsSet: boolean;
}

export function rankActions(input: RankInput): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  const name = (id: string) => input.values.get(id)?.player.name ?? 'Unknown player';

  // A lineup that was never set is the first thing to fix — it costs more than any
  // single swap, and it is entirely under your control.
  if (!input.lineupIsSet) {
    actions.push({
      kind: 'LINEUP_CHANGE',
      priority: 'HIGH',
      headline: 'Set your starting lineup',
      detail:
        'No player on your roster is currently in a starting slot, so this roster would score nothing.',
      reasoning: [
        'Every rostered player is on the bench or IR.',
        'The optimal lineup for this roster is shown on the Matchups page.',
      ],
      confidence: 0.99,
      expectedGain: null,
      risk: null,
      alternative: null,
      dataUsed: ['rosters', 'league-config'],
    });
  }

  // Unfillable starting slots are always the top problem.
  for (const slot of input.unfilledSlots) {
    actions.push({
      kind: 'ROSTER_HOLE',
      priority: 'HIGH',
      headline: `You cannot fill your ${slot} slot`,
      detail: `Your roster has nobody eligible for ${slot}. Any points from that slot are currently zero.`,
      reasoning: [`${slot} is a required starting slot in this league and no rostered player is eligible.`],
      confidence: 0.98,
      expectedGain: null,
      risk: null,
      alternative: 'Stream the position from free agency this week.',
      dataUsed: ['rosters', 'league-config'],
    });
  }

  // Lineup changes are free points.
  for (const change of input.lineupChanges.filter((c) => c.gain > 0.5).slice(0, 2)) {
    actions.push({
      kind: 'LINEUP_CHANGE',
      priority: change.gain > 3 ? 'HIGH' : 'MEDIUM',
      headline: `Start ${name(change.startPlayerId)} over ${name(change.benchPlayerId)}`,
      detail: `Worth about ${change.gain} projected points, and it costs nothing.`,
      reasoning: [
        `${name(change.startPlayerId)} out-projects ${name(change.benchPlayerId)} by ${change.gain} points.`,
        'Lineup optimisation is the only free win available — no FAAB, no trade partner needed.',
      ],
      confidence: 0.9,
      expectedGain: change.gain,
      risk: 'Projections can be wrong week to week; check inactives before lock.',
      alternative: null,
      dataUsed: ['projections', 'rosters', 'league-config'],
    });
  }

  // Waiver claims.
  for (const target of input.waiverTargets.filter((t) => t.priority !== 'LOW').slice(0, 2)) {
    actions.push({
      kind: 'WAIVER_CLAIM',
      priority: target.priority,
      headline: `Bid $${target.recommendedBid} on ${target.player.player.name} (${target.player.player.position})`,
      detail: `Range $${target.bidRangeLow}–$${target.bidRangeHigh}; go to $${target.aggressiveBid} if you want to guarantee it.`,
      reasoning: target.reasoning,
      confidence: target.rosterImpact >= 65 ? 0.82 : 0.66,
      expectedGain: target.marginalStarterGain,
      risk:
        target.expectedCompetition === 'HIGH'
          ? 'Multiple rivals have both the need and the budget — you may need the aggressive number.'
          : 'Low competition expected, so the recommended bid should clear.',
      alternative:
        input.waiverTargets[1] && input.waiverTargets[1] !== target
          ? `${input.waiverTargets[1].player.player.name} at $${input.waiverTargets[1].recommendedBid}`
          : null,
      dataUsed: ['projections', 'rosters', 'faab-balances', 'league-config'],
    });
  }

  // Trades.
  for (const idea of input.tradeIdeas.slice(0, 1)) {
    actions.push({
      kind: 'TRADE_OFFER',
      priority: idea.myGain > 8 ? 'HIGH' : 'MEDIUM',
      headline: `Offer ${idea.send.map((p) => p.player.name).join(' + ')} to ${idea.partnerTeamName} for ${idea.receive.map((p) => p.player.name).join(' + ')}`,
      detail: `You gain ${idea.myGain} starting points; they gain ${idea.partnerGain}. Both lineups improve, so they have a reason to say yes.`,
      reasoning: [...idea.reasoning, idea.partnerMotivation],
      confidence: idea.fairnessScore > 70 ? 0.72 : 0.58,
      expectedGain: idea.myGain,
      risk: 'Trade models cannot see manager psychology — an owner may simply refuse to trade within the position.',
      alternative: null,
      dataUsed: ['projections', 'rosters', 'team-needs', 'league-config'],
    });
  }

  // Hold FAAB when nothing is worth buying.
  if (
    input.waiverTargets.length > 0 &&
    input.waiverTargets.every((t) => t.priority === 'LOW') &&
    input.myFaabRemaining > input.config.faabBudget * 0.4
  ) {
    actions.push({
      kind: 'HOLD_FAAB',
      priority: 'LOW',
      headline: 'Hold your FAAB this week',
      detail: `Nothing on the wire meaningfully improves your starting lineup, and you still have $${input.myFaabRemaining} of $${input.config.faabBudget}.`,
      reasoning: [
        'The best available free agent does not crack your optimal lineup.',
        'Unspent budget retains option value for an injury-replacement week.',
      ],
      confidence: 0.7,
      expectedGain: 0,
      risk: 'A breakout can appear with no warning; re-check after Sunday games.',
      alternative: 'Place a $1–2 speculative claim on the highest-upside bench stash.',
      dataUsed: ['projections', 'faab-balances'],
    });
  }

  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return actions.sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      (b.expectedGain ?? 0) - (a.expectedGain ?? 0),
  );
}

/** The top 3 actions, for the dashboard button. */
export function topActions(report: WeeklyReport, limit = 3): RecommendedAction[] {
  return report.actions.slice(0, limit);
}

function emptyGrade(): TeamGrade {
  return {
    teamId: '',
    overallScore: 0,
    overallGrade: 'N/A',
    positionGrades: [],
    projectedPoints: 0,
    weeklyProjection: 0,
    floorProjection: 0,
    ceilingProjection: 0,
    starterStrength: 0,
    benchStrength: 0,
    depthScore: 0,
    injuryRisk: 0,
    byeRisk: 0,
    playoffStrength: 0,
    strengths: [],
    weaknesses: [],
    explain: { value: 0, inputs: {}, formula: 'no data', sources: [] },
  };
}
