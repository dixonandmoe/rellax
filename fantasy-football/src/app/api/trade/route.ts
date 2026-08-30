import { NextResponse } from 'next/server';
import { z } from 'zod';
import { evaluateTrade } from '@/domain/trade';
import { indexByPlayer, valuePlayers } from '@/domain/valuation';
import { loadLeagueState } from '@/services/league-state';

/** Evaluates a hypothetical trade against the live league state. */
const RequestSchema = z.object({
  proposingTeamId: z.string().min(1),
  receivingTeamId: z.string().min(1),
  /** Players the proposing team sends away. */
  sendPlayerIds: z.array(z.string()).min(1).max(6),
  /** Players the proposing team receives. */
  receivePlayerIds: z.array(z.string()).min(1).max(6),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid trade request', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const loaded = await loadLeagueState();
  const { state } = loaded;

  const proposer = state.teams.find((t) => t.id === parsed.data.proposingTeamId);
  const receiver = state.teams.find((t) => t.id === parsed.data.receivingTeamId);

  if (!proposer || !receiver) {
    return NextResponse.json({ error: 'Unknown team id.' }, { status: 404 });
  }
  if (proposer.id === receiver.id) {
    return NextResponse.json({ error: 'A team cannot trade with itself.' }, { status: 400 });
  }

  if (state.seasonProjections.length === 0) {
    return NextResponse.json(
      {
        error:
          'No projections are loaded, so a trade cannot be evaluated. Import projections first.',
      },
      { status: 409 },
    );
  }

  const valuation = valuePlayers(state.config, state.players, state.seasonProjections, {
    injuries: state.injuries,
  });
  const values = indexByPlayer(valuation);

  const unknown = [...parsed.data.sendPlayerIds, ...parsed.data.receivePlayerIds].filter(
    (id) => !values.has(id),
  );
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `No projection available for: ${unknown.join(', ')}` },
      { status: 409 },
    );
  }

  const evaluation = evaluateTrade(
    state.config,
    proposer,
    receiver,
    parsed.data.sendPlayerIds,
    parsed.data.receivePlayerIds,
    values,
  );

  return NextResponse.json({
    verdict: evaluation.verdict,
    winner: evaluation.winner,
    realistic: evaluation.realistic,
    reasoning: evaluation.reasoning,
    sides: evaluation.sides,
    explain: evaluation.explain,
  });
}
