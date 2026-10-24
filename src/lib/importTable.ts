/**
 * Reading a CSV or Excel file for an import (products, past sales): the
 * table, which columns are which, and the numbers, dates and times in it.
 * Everything but readTable is pure and unit tested (tests/unit/importTable.test.ts).
 */
export type Cell = string | number | boolean | Date | null;

export interface Table {
  headers: string[];
  rows: Cell[][];
  /** Each row's line in the spreadsheet (1 = the first line), for "row 12: no price". */
  lines: number[];
  /** CSV and text files: the character that splits the columns. */
  delimiter?: Delimiter;
  /** Excel: the sheet's name ("Products", "Transactions"). */
  name?: string;
}

/** What splits the columns of a CSV or text file. */
export const DELIMITERS = [',', ';', '\t', '|'] as const;
export type Delimiter = (typeof DELIMITERS)[number];
export const DELIMITER_LABEL: Record<Delimiter, string> = { ',': 'Commas (,)', ';': 'Semicolons (;)', '\t': 'Tabs', '|': 'Bars (|)' };

/** One JPOS field an import fills, and the column names that usually hold it. */
export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  names: string[];
}

/** Field key → column index (-1 = not in the file). */
export type Columns = Record<string, number>;

export const IMPORT_ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls';
export const IMPORT_MAX_MB = 10;

/**
 * Reads every sheet that has rows (a CSV is one sheet). CSV and text files:
 * JPOS finds what splits the columns (or uses `delimiter`), and their text
 * stays text (JPOS reads numbers and dates itself). Excel dates come back in
 * this device's time zone.
 */
export async function readBook(file: File, opts: { delimiter?: Delimiter } = {}): Promise<Table[]> {
  const name = file.name.toLowerCase();
  if (!/\.(csv|tsv|txt|xlsx|xls)$/.test(name)) throw new Error('Use a CSV or Excel file (.csv, .xlsx or .xls).');
  if (file.size > IMPORT_MAX_MB * 1024 * 1024) throw new Error(`This file is too big. Use one of ${IMPORT_MAX_MB} MB or less.`);
  const XLSX = await import('xlsx');
  const sheets: { name?: string; rows: Cell[][] }[] = [];
  let delimiter: Delimiter | undefined;
  try {
    if (/\.(csv|tsv|txt)$/.test(name)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let text: string;
      // Excel on Windows often saves CSV in its own encoding, not UTF-8
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = new TextDecoder('windows-1252').decode(bytes); }
      text = text.replace(/^\uFEFF/, '');
      delimiter = opts.delimiter ?? guessDelimiter(text);
      const book = XLSX.read(text.replace(SEP_LINE, ''), { type: 'string', raw: true, FS: delimiter });
      const rows = XLSX.utils.sheet_to_json<Cell[]>(book.Sheets[book.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: true });
      // Files split by semicolons or tabs usually write money as 85,50
      sheets.push({ rows: delimiter === ',' ? rows : rows.map(r => (r ?? []).map(fixDecimalComma)) });
    } else {
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      for (const sheet of book.SheetNames) {
        sheets.push({ name: sheet, rows: XLSX.utils.sheet_to_json<Cell[]>(book.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: true }) });
      }
    }
  } catch {
    throw new Error("This file couldn't be read. Save it again as CSV or Excel (.xlsx), then try once more.");
  }
  const tables = sheets
    .map(s => ({ ...tableFrom(s.rows), ...(s.name ? { name: s.name } : {}), ...(delimiter ? { delimiter } : {}) }))
    .filter(t => t.rows.length);
  if (!tables.length) throw new Error('This file has no rows to import.');
  return tables;
}

/** The first sheet with rows. */
export async function readTable(file: File, opts: { delimiter?: Delimiter } = {}): Promise<Table> {
  return (await readBook(file, opts))[0];
}

/** How well a sheet fits an import: needed fields found count 3, others 1. */
export function sheetScore(table: Table, fields: FieldDef[]): number {
  const cols = guessColumns(table.headers, fields);
  return fields.reduce((s, f) => s + (cols[f.key] >= 0 ? (f.required ? 3 : 1) : 0), 0);
}

/** The sheet that fits these fields best (the first one on a tie). */
export function bestSheet(tables: Table[], fields: FieldDef[]): number {
  let best = 0;
  tables.forEach((t, i) => { if (sheetScore(t, fields) > sheetScore(tables[best], fields)) best = i; });
  return best;
}

/** Excel sometimes writes "sep=;" on the first line to say what splits the columns. */
const SEP_LINE = /^\s*sep\s*=\s*(.)[^\S\r\n]*\r?\n/i;

/** How often `d` splits this line (not inside quotes), and how often it sits between two digits (85,50). */
function countIn(line: string, d: string): { all: number; betweenDigits: number } {
  let quoted = false;
  let all = 0;
  let betweenDigits = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === d && !quoted) {
      all++;
      if (/\d/.test(line[i - 1] ?? '') && /\d/.test(line[i + 1] ?? '')) betweenDigits++;
    }
  }
  return { all, betweenDigits };
}

/**
 * What splits the columns of a CSV or text file: the character that appears
 * the same number of times on the most lines (quoted text left out). On a tie,
 * the one less often between two digits (85,50 is a decimal comma, not a
 * column). Excel's "sep=;" first line wins. Nothing found: commas.
 */
export function guessDelimiter(text: string): Delimiter {
  const sep = SEP_LINE.exec(text)?.[1];
  if (sep && (DELIMITERS as readonly string[]).includes(sep)) return sep as Delimiter;
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 30);
  let best: { d: Delimiter; lines: number; betweenDigits: number } | null = null;
  for (const d of DELIMITERS) {
    const counts = lines.map(l => countIn(l, d));
    const used = counts.map(c => c.all).filter(n => n > 0);
    if (!used.length) continue;
    const tally = new Map<number, number>();
    used.forEach(n => tally.set(n, (tally.get(n) ?? 0) + 1));
    const usual = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const steady = counts.filter(c => c.all === usual).length;
    const betweenDigits = counts.reduce((s, c) => s + c.betweenDigits, 0);
    if (!best || steady > best.lines || (steady === best.lines && betweenDigits < best.betweenDigits)) {
      best = { d, lines: steady, betweenDigits };
    }
  }
  return best?.d ?? ',';
}

/** "85,50" → "85.50", "₱1.234,50" → "₱1234.50" (a decimal comma); "1,500" and text stay as they are. */
export function fixDecimalComma(c: Cell): Cell {
  if (typeof c !== 'string') return c;
  const m = /^(\(?-?(?:₱|php\s?|p)?\s*)(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})(\)?)$/i.exec(c.trim());
  return m ? `${m[1]}${m[2].replace(/\./g, '')}.${m[3]}${m[4]}` : c;
}

/** The header row is the first of the top 10 rows with two or more names in it; empty rows are left out. */
export function tableFrom(raw: Cell[][]): Table {
  const rows = raw.map(r => (r ?? []).map(c => (typeof c === 'string' ? c.trim() : c ?? null)));
  const at = rows.slice(0, 10).findIndex(r => r.filter(c => typeof c === 'string' && c !== '').length >= 2);
  if (at < 0) return { headers: [], rows: [], lines: [] };
  const width = Math.max(...rows.map(r => r.length));
  const headers = Array.from({ length: width }, (_, i) => {
    const h = rows[at][i];
    return h == null || h === '' ? `Column ${i + 1}` : String(h);
  });
  const body: Cell[][] = [];
  const lines: number[] = [];
  rows.forEach((r, i) => {
    if (i <= at || !r.some(c => c !== null && c !== '')) return;
    body.push(r);
    lines.push(i + 1);
  });
  return { headers, rows: body, lines };
}

/** "Product Name", "product_name", "PRODUCT-NAME" → "product name". */
export const normalizeName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Which column holds which field: exact names first (for every field), then
 * names inside a longer column name ("Selling Price (PHP)"). A field's names
 * are tried in order, so "Total Amount" wins over "Subtotal". One column per field.
 */
export function guessColumns(headers: string[], fields: FieldDef[]): Columns {
  const heads = headers.map(normalizeName);
  const used = new Set<number>();
  const out: Columns = {};
  for (const f of fields) {
    for (const x of f.names.map(normalizeName)) {
      const i = heads.findIndex((h, n) => !used.has(n) && h !== '' && h === x);
      if (i >= 0) { out[f.key] = i; used.add(i); break; }
    }
  }
  // Names inside longer column names: the longest name found wins first ("minimum stock" before "stock")
  const found: { key: string; col: number; len: number; rank: number }[] = [];
  for (const f of fields) {
    if (out[f.key] !== undefined) continue;
    f.names.map(normalizeName).forEach((x, rank) => {
      if (x.length < 3) return;
      heads.forEach((h, col) => { if (h && ` ${h} `.includes(` ${x} `)) found.push({ key: f.key, col, len: x.length, rank }); });
    });
  }
  found.sort((a, b) => b.len - a.len || a.rank - b.rank || a.col - b.col);
  for (const c of found) {
    if (out[c.key] === undefined && !used.has(c.col)) { out[c.key] = c.col; used.add(c.col); }
  }
  for (const f of fields) out[f.key] ??= -1;
  return out;
}

/** The cell of a field in a row (null when the field has no column). */
export const cellOf = (row: Cell[], cols: Columns, key: string): Cell => (cols[key] >= 0 ? row[cols[key]] ?? null : null);

/** A cell as plain text ('' for nothing). */
export function textOf(c: Cell): string {
  if (c == null) return '';
  if (c instanceof Date) return isNaN(+c) ? '' : c.toISOString();
  return String(c).trim();
}

/** "₱1,234.50", "PHP 1234.5", "P25", "(25.00)", 25 → a number; anything else → null. */
export function parseNumber(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  if (typeof c !== 'string') return null;
  let s = c.trim().replace(/^(php|₱|p)\s*/i, '').replace(/[\s₱]/g, '').replace(/,/g, '');
  const negative = /^\(.+\)$/.test(s);
  if (negative) s = s.slice(1, -1);
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

/** Excel keeps times as fractions of a day: 5:33 PM can come back as 5:32:59.999. */
const toSecond = (d: Date) => new Date(Math.round(d.getTime() / 1000) * 1000);

export type DayOrder = 'mdy' | 'dmy';

/**
 * How a column's dates are written: day first when any first number is over
 * 12 (20/10/2026); otherwise month first, the usual way in the Philippines.
 */
export function guessDayOrder(cells: Cell[]): DayOrder {
  for (const c of cells) {
    if (typeof c !== 'string') continue;
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(c.trim());
    if (m && Number(m[1]) > 12) return 'dmy';
  }
  return 'mdy';
}

/** Some dates in the column could be read either way (03/04/2026). */
export function hasAmbiguousDates(cells: Cell[]): boolean {
  return cells.some(c => {
    const m = typeof c === 'string' ? /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(c.trim()) : null;
    return !!m && Number(m[1]) <= 12 && Number(m[2]) <= 12 && m[1] !== m[2];
  });
}

export interface TimeOfDay { h: number; m: number; s: number }

/** "14:30", "2:30 PM", "2:30pm", "14:30:15", an Excel time, or a fraction of a day → the time; else null. */
export function parseTime(c: Cell): TimeOfDay | null {
  if (c instanceof Date) {
    if (isNaN(+c)) return null;
    const d = toSecond(c);
    return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
  }
  if (typeof c === 'number') {
    if (!(c >= 0) || c >= 1) return null;
    const secs = Math.round(c * 86400) % 86400;
    return { h: Math.floor(secs / 3600), m: Math.floor((secs % 3600) / 60), s: secs % 60 };
  }
  if (typeof c !== 'string') return null;
  const m = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?(?:\.\d+)?\s*(?:([ap])\.?\s*m\.?)?$/i.exec(c.trim());
  if (!m || (!m[2] && !m[4])) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const sec = Number(m[3] ?? 0);
  if (m[4]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[4].toLowerCase() === 'p' ? 12 : 0);
  }
  if (h > 23 || min > 59 || sec > 59) return null;
  return { h, m: min, s: sec };
}

/** A real calendar day and time in this device's time zone, or null (no 31 February). */
function makeDate(y: number, mo: number, d: number, time?: TimeOfDay | null): Date | null {
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d, time?.h ?? 0, time?.m ?? 0, time?.s ?? 0);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** An Excel day number (45950 = 20 Oct 2025) or 20261020 → a date; other numbers aren't dates. */
function dateFromNumber(n: number): Date | null {
  if (Number.isInteger(n) && n >= 19000101 && n <= 22001231) return makeDate(Math.floor(n / 10000), Math.floor(n / 100) % 100, n % 100);
  if (n < 20000 || n > 110000) return null;
  const day = Math.floor(n);
  const base = new Date(1899, 11, 30 + day);
  return parseTime(n - day) && n !== day
    ? makeDate(base.getFullYear(), base.getMonth() + 1, base.getDate(), parseTime(n - day))
    : base;
}

/**
 * A date (and its time, when the cell has one) in this device's time zone:
 * Excel dates, "2026-10-20 14:30", "10/20/2026 2:30 PM", "20/10/26",
 * "Oct 20, 2026", an ISO time with a zone. Anything else → null.
 */
export function parseDate(c: Cell, order: DayOrder = 'mdy'): Date | null {
  if (c instanceof Date) return isNaN(+c) ? null : toSecond(c);
  if (typeof c === 'number') return dateFromNumber(c);
  if (typeof c !== 'string' || !c.trim()) return null;
  const s = c.trim();
  if (/^\d{4}-\d{2}-\d{2}T.+(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    return isNaN(+d) ? null : d;
  }
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s,]+(.+))?$/.exec(s);
  if (m) {
    const time = m[4] ? parseTime(m[4]) : null;
    return m[4] && !time ? null : makeDate(Number(m[1]), Number(m[2]), Number(m[3]), time);
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s,]+(.+))?$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const time = m[4] ? parseTime(m[4]) : null;
    if (m[4] && !time) return null;
    const [a, b] = [Number(m[1]), Number(m[2])];
    return order === 'dmy' ? makeDate(y, b, a, time) : makeDate(y, a, b, time);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return dateFromNumber(Number(s));
  // Month names ("Oct 20, 2026", "20 October 2026 2:30 PM"): the browser reads those
  if (/[a-z]{3}/i.test(s)) {
    const d = new Date(s.replace(/(\d)(am|pm)\b/i, '$1 $2'));
    return isNaN(+d) || d.getFullYear() < 1900 ? null : d;
  }
  return null;
}

/** The time from a separate Time column, put on the date. */
export function withTime(date: Date, time: TimeOfDay | null): Date {
  if (!time) return date;
  const d = new Date(date);
  d.setHours(time.h, time.m, time.s, 0);
  return d;
}

/**
 * A short, steady fingerprint of some text (two 53-bit hashes, hex): the same
 * row always gets the same id, so importing a file twice doesn't add it twice.
 */
export function fingerprint(text: string): string {
  const hash = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  };
  return hash(1) + hash(7);
}

export const roundMoney2 = (n: number) => Math.round(n * 100) / 100;

/** A CSV file to download (a sample for the import). Cells with commas or quotes are quoted. */
export function csvFile(rows: (string | number)[][]): Blob {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return new Blob(['\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}
