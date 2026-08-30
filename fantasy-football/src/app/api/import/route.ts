import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parsePlayerImport, toAdpEntries } from '@/providers/manual/parse';

/**
 * Manual import endpoint.
 *
 * Parses CSV or JSON and reports exactly what it understood — recognised columns, ignored
 * columns, and per-line errors — so a bad import is visible rather than silently partial.
 * Persistence is deliberately a separate step: this route validates and previews.
 */

const RequestSchema = z.object({
  content: z.string().min(1).max(5_000_000),
  season: z.coerce.number().int().min(2000).max(2100),
  source: z.string().min(1).max(60).default('manual-import'),
  adpFormat: z.string().min(1).max(60).default('manual'),
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
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { content, season, source, adpFormat } = parsed.data;
  const result = parsePlayerImport(content, { season, source });
  const adp = toAdpEntries(result.rows, { season, format: adpFormat, source });

  return NextResponse.json({
    playerCount: result.rows.length,
    projectionCount: result.rows.filter((row) => row.projection).length,
    adpCount: adp.length,
    recognisedColumns: result.recognisedColumns,
    ignoredColumns: result.ignoredColumns,
    errors: result.errors,
    preview: result.rows.slice(0, 10).map((row) => ({
      id: row.player.id,
      name: row.player.name,
      position: row.player.position,
      nflTeam: row.player.nflTeam ?? null,
      byeWeek: row.player.byeWeek ?? null,
      hasProjection: Boolean(row.projection),
      adp: row.adp ?? null,
    })),
  });
}
