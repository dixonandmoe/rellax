import type {
  AdpEntry,
  Player,
  PlayerStatus,
  Position,
  Projection,
  StatLine,
} from '@/domain/types';
import { POSITIONS } from '@/domain/types';

/**
 * Manual import: CSV, JSON, or pasted text.
 *
 * The app must be fully usable with no ESPN connection at all, so this is a first-class
 * path, not a fallback of last resort. Parsing is strict about what it does not
 * understand: an unparseable row is reported as an error with its line number rather than
 * silently dropped or filled with zeros.
 */

export interface ParseResult<T> {
  rows: T[];
  errors: Array<{ line: number; message: string }>;
  /** Column headers we recognised, for the UI to confirm the mapping. */
  recognisedColumns: string[];
  ignoredColumns: string[];
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Header aliases, so an import does not require an exact column naming convention. */
const COLUMN_ALIASES: Record<string, string> = {
  player: 'name',
  playername: 'name',
  name: 'name',
  pos: 'position',
  position: 'position',
  team: 'nflTeam',
  nflteam: 'nflTeam',
  tm: 'nflTeam',
  bye: 'byeWeek',
  byeweek: 'byeWeek',
  status: 'status',
  adp: 'adp',
  id: 'id',
  playerid: 'id',
  // Stat columns
  passyards: 'passYards',
  passyds: 'passYards',
  passtd: 'passTd',
  passtds: 'passTd',
  int: 'interceptions',
  interceptions: 'interceptions',
  rushyards: 'rushYards',
  rushyds: 'rushYards',
  rushtd: 'rushTd',
  rushtds: 'rushTd',
  rec: 'receptions',
  receptions: 'receptions',
  recyards: 'recYards',
  recyds: 'recYards',
  rectd: 'recTd',
  rectds: 'recTd',
  fumbleslost: 'fumblesLost',
  fum: 'fumblesLost',
};

const STAT_FIELDS = new Set<keyof StatLine>([
  'passYards', 'passTd', 'interceptions', 'rushYards', 'rushTd',
  'receptions', 'recYards', 'recTd', 'fumblesLost',
]);

export interface ImportedPlayerRow {
  player: Player;
  projection?: Projection;
  adp?: number;
}

/**
 * Parse a player/projection import.
 *
 * A row without stat columns yields a player with no projection — which the app then
 * reports as "Data unavailable" rather than treating as a zero-point player.
 */
export function parsePlayerImport(
  text: string,
  options: { season: number; source: string; asOf?: string },
): ParseResult<ImportedPlayerRow> {
  const asOf = options.asOf ?? new Date().toISOString();
  const trimmed = text.trim();

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJsonPlayers(trimmed, options, asOf);
  }

  const table = parseCsv(trimmed);
  const errors: ParseResult<ImportedPlayerRow>['errors'] = [];

  if (table.length < 2) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'Need a header row and at least one data row.' }],
      recognisedColumns: [],
      ignoredColumns: [],
    };
  }

  const header = table[0]!.map((h) => normaliseHeader(h));
  const mapped = header.map((h) => COLUMN_ALIASES[h] ?? null);
  const recognised = mapped.filter((m): m is string => m !== null);
  const ignored = header.filter((_, i) => mapped[i] === null);

  if (!recognised.includes('name')) {
    return {
      rows: [],
      errors: [
        { line: 1, message: `No player-name column found. Recognised headers: ${header.join(', ')}` },
      ],
      recognisedColumns: recognised,
      ignoredColumns: ignored,
    };
  }

  const rows: ImportedPlayerRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const cells = table[r]!;
    const record: Record<string, string> = {};
    for (let c = 0; c < mapped.length; c++) {
      const key = mapped[c];
      if (key) record[key] = (cells[c] ?? '').trim();
    }

    const name = record.name;
    if (!name) {
      errors.push({ line: r + 1, message: 'Missing player name.' });
      continue;
    }

    const position = parsePosition(record.position);
    if (!position) {
      errors.push({
        line: r + 1,
        message: `Unrecognised position "${record.position ?? ''}" for ${name}.`,
      });
      continue;
    }

    const player: Player = {
      id: record.id || slugId(name, position),
      name,
      position,
      nflTeam: record.nflTeam || undefined,
      byeWeek: numberOrUndefined(record.byeWeek),
      status: parseStatus(record.status),
      source: options.source,
      asOf,
    };

    const stats: StatLine = {};
    let hasStats = false;
    for (const field of STAT_FIELDS) {
      const raw = record[field];
      const value = numberOrUndefined(raw);
      if (value !== undefined) {
        stats[field] = value;
        hasStats = true;
      }
    }

    rows.push({
      player,
      projection: hasStats
        ? { playerId: player.id, season: options.season, stats, source: options.source, asOf }
        : undefined,
      adp: numberOrUndefined(record.adp),
    });
  }

  return { rows, errors, recognisedColumns: recognised, ignoredColumns: ignored };
}

function parseJsonPlayers(
  text: string,
  options: { season: number; source: string },
  asOf: string,
): ParseResult<ImportedPlayerRow> {
  try {
    const parsed: unknown = JSON.parse(text);
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { players?: unknown[] }).players)
        ? (parsed as { players: unknown[] }).players
        : null;

    if (!list) {
      return {
        rows: [],
        errors: [{ line: 1, message: 'JSON must be an array of players, or { "players": [...] }.' }],
        recognisedColumns: [],
        ignoredColumns: [],
      };
    }

    const rows: ImportedPlayerRow[] = [];
    const errors: ParseResult<ImportedPlayerRow>['errors'] = [];

    list.forEach((raw, index) => {
      const entry = raw as Record<string, unknown>;
      const name = typeof entry.name === 'string' ? entry.name : undefined;
      const position = parsePosition(typeof entry.position === 'string' ? entry.position : undefined);
      if (!name || !position) {
        errors.push({ line: index + 1, message: 'Each entry needs a name and a valid position.' });
        return;
      }

      const player: Player = {
        id: typeof entry.id === 'string' ? entry.id : slugId(name, position),
        name,
        position,
        nflTeam: typeof entry.nflTeam === 'string' ? entry.nflTeam : undefined,
        byeWeek: typeof entry.byeWeek === 'number' ? entry.byeWeek : undefined,
        status: parseStatus(typeof entry.status === 'string' ? entry.status : undefined),
        source: options.source,
        asOf,
      };

      const stats = entry.stats && typeof entry.stats === 'object' ? (entry.stats as StatLine) : undefined;

      rows.push({
        player,
        projection: stats
          ? { playerId: player.id, season: options.season, stats, source: options.source, asOf }
          : undefined,
        adp: typeof entry.adp === 'number' ? entry.adp : undefined,
      });
    });

    return { rows, errors, recognisedColumns: ['json'], ignoredColumns: [] };
  } catch (error) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }],
      recognisedColumns: [],
      ignoredColumns: [],
    };
  }
}

/** Parse a pasted roster: one player per line, optionally "Name, POS". */
export function parseRosterPaste(text: string, knownPlayers: Player[]): {
  matched: Player[];
  unmatched: string[];
} {
  const byName = new Map(knownPlayers.map((p) => [normaliseName(p.name), p]));
  const matched: Player[] = [];
  const unmatched: string[] = [];

  for (const line of text.split('\n')) {
    const cleaned = line.replace(/^\s*\d+[.)]\s*/, '').trim();
    if (!cleaned) continue;
    const namePart = cleaned.split(/[,|\t]/)[0]!.trim();
    const player = byName.get(normaliseName(namePart));
    if (player) matched.push(player);
    else unmatched.push(cleaned);
  }

  return { matched, unmatched };
}

export function toAdpEntries(
  rows: ImportedPlayerRow[],
  options: { season: number; format: string; source: string; asOf?: string },
): AdpEntry[] {
  const asOf = options.asOf ?? new Date().toISOString();
  return rows
    .filter((row) => row.adp !== undefined)
    .map((row) => ({
      playerId: row.player.id,
      adp: row.adp!,
      format: options.format,
      source: options.source,
      asOf,
    }));
}

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

export function parsePosition(raw: string | undefined): Position | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if ((POSITIONS as readonly string[]).includes(upper)) return upper as Position;
  if (upper === 'D/ST' || upper === 'DEF' || upper === 'D') return 'DST';
  if (upper === 'PK') return 'K';
  return null;
}

function parseStatus(raw: string | undefined): PlayerStatus {
  if (!raw) return 'ACTIVE';
  const upper = raw.trim().toUpperCase();
  const known: PlayerStatus[] = ['ACTIVE', 'QUESTIONABLE', 'DOUBTFUL', 'OUT', 'IR', 'SUSPENDED'];
  return known.includes(upper as PlayerStatus) ? (upper as PlayerStatus) : 'ACTIVE';
}

function numberOrUndefined(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(value) ? value : undefined;
}

function slugId(name: string, position: Position): string {
  return `manual-${position.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
