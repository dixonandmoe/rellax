import { NextResponse } from 'next/server';
import { z } from 'zod';
import { credentialFingerprint, describeStatus } from '@/providers/espn/client';
import { EspnProvider } from '@/providers/espn/espn-provider';

/**
 * ESPN connection test.
 *
 * Credentials are accepted in the request body (so the connection page can test a value
 * before it is saved) but are never echoed back — the response contains only a masked
 * fingerprint and a status.
 */

const RequestSchema = z.object({
  leagueId: z.string().min(1),
  season: z.coerce.number().int().min(2000).max(2100),
  espnS2: z.string().optional(),
  swid: z.string().optional(),
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
      { ok: false, error: 'A league id and season are required.', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { leagueId, season, espnS2, swid } = parsed.data;
  const provider = new EspnProvider({ credentials: { leagueId, season, espnS2, swid } });
  const result = await provider.getLeagueSettings();

  return NextResponse.json({
    ok: result.ok,
    status: result.status,
    message: result.message ?? describeStatus(result.status),
    asOf: result.asOf,
    // Masked only — the raw cookies never travel back to the browser.
    credentials: {
      leagueId,
      season,
      espnS2: credentialFingerprint(espnS2),
      swid: credentialFingerprint(swid),
      privateLeagueCredentialsProvided: Boolean(espnS2 && swid),
    },
    league: result.ok && result.data
      ? {
          name: result.data.name,
          teamCount: result.data.teamCount,
          lineup: result.data.lineup,
          waiverType: result.data.waiverType,
          faabBudget: result.data.faabBudget,
          receptionPoints: result.data.scoring.receptionPoints,
        }
      : null,
  });
}
