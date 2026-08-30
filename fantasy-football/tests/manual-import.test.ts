import { describe, expect, it } from 'vitest';
import { parseCsv, parsePlayerImport, parseRosterPaste, toAdpEntries } from '@/providers/manual/parse';
import { buildSamplePlayers } from '@/providers/sample/sample-league';

describe('parseCsv', () => {
  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('name,team\n"Smith, John",KC\n');
    expect(rows[1]).toEqual(['Smith, John', 'KC']);
  });

  it('handles escaped quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')[1]).toEqual(['say "hi"']);
  });

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toHaveLength(2);
  });
});

describe('parsePlayerImport', () => {
  const options = { season: 2026, source: 'manual-test', asOf: '2026-08-01T00:00:00.000Z' };

  it('imports players with projections from a CSV', () => {
    const csv = [
      'Player,Pos,Team,Bye,PassYds,PassTD,INT',
      'Test QB,QB,KC,10,4200,32,11',
    ].join('\n');
    const result = parsePlayerImport(csv, options);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.player.position).toBe('QB');
    expect(result.rows[0]!.player.byeWeek).toBe(10);
    expect(result.rows[0]!.projection!.stats).toEqual({
      passYards: 4200,
      passTd: 32,
      interceptions: 11,
    });
  });

  it('imports a player with no stat columns and leaves the projection absent', () => {
    const result = parsePlayerImport('Player,Pos\nTest WR,WR', options);
    expect(result.rows[0]!.projection).toBeUndefined();
    expect(result.rows[0]!.player.name).toBe('Test WR');
  });

  it('reports unparseable rows with line numbers rather than dropping them silently', () => {
    const csv = ['Player,Pos', 'Good Player,RB', 'Bad Player,XX', ',WR'].join('\n');
    const result = parsePlayerImport(csv, options);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([
      { line: 3, message: 'Unrecognised position "XX" for Bad Player.' },
      { line: 4, message: 'Missing player name.' },
    ]);
  });

  it('accepts common position spellings', () => {
    const result = parsePlayerImport('Player,Pos\nD One,D/ST\nK One,PK', options);
    expect(result.rows.map((r) => r.player.position)).toEqual(['DST', 'K']);
  });

  it('recognises header aliases and reports ignored columns', () => {
    const result = parsePlayerImport('Name,Position,Tm,Rec,RecYds,Notes\nA,WR,KC,90,1100,ignore', options);
    expect(result.recognisedColumns).toContain('nflTeam');
    expect(result.ignoredColumns).toContain('notes');
    expect(result.rows[0]!.projection!.stats.receptions).toBe(90);
  });

  it('fails clearly when there is no name column', () => {
    const result = parsePlayerImport('Pos,Team\nQB,KC', options);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]!.message).toContain('No player-name column');
  });

  it('imports JSON as well as CSV', () => {
    const json = JSON.stringify([
      { name: 'JSON QB', position: 'QB', stats: { passYards: 4000, passTd: 30 }, adp: 12 },
    ]);
    const result = parsePlayerImport(json, options);
    expect(result.rows[0]!.player.name).toBe('JSON QB');
    expect(result.rows[0]!.projection!.stats.passTd).toBe(30);
    expect(result.rows[0]!.adp).toBe(12);
  });

  it('reports invalid JSON rather than throwing', () => {
    const result = parsePlayerImport('{ not json', options);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]!.message).toContain('Invalid JSON');
  });

  it('stamps the source and timestamp on everything it imports', () => {
    const result = parsePlayerImport('Player,Pos,PassYds\nA,QB,4000', options);
    expect(result.rows[0]!.player.source).toBe('manual-test');
    expect(result.rows[0]!.projection!.asOf).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('toAdpEntries', () => {
  it('only emits entries for rows that actually carried an ADP', () => {
    const result = parsePlayerImport('Player,Pos,ADP\nA,QB,12\nB,RB,', {
      season: 2026,
      source: 'manual-test',
    });
    const entries = toAdpEntries(result.rows, {
      season: 2026,
      format: '0.5ppr-2qb-8team',
      source: 'manual-test',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.adp).toBe(12);
  });
});

describe('parseRosterPaste', () => {
  it('matches pasted names against known players and reports the rest', () => {
    const players = buildSamplePlayers();
    const paste = ['1. QB One', 'RB Two, RB', 'Nobody At All'].join('\n');
    const { matched, unmatched } = parseRosterPaste(paste, players);
    expect(matched.map((p) => p.id)).toEqual(['qb-1', 'rb-2']);
    expect(unmatched).toEqual(['Nobody At All']);
  });
});
