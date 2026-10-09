// Turns a spreadsheet, CSV, JSON file, or pasted rows into validated rows and
// a report of every row that was rejected and why. The steps:
//
//   readSource   file or pasted text -> sheets of cells (or a JSON list)
//   tabulate     a sheet -> header row + data rows
//   autoMap      headers -> the table's columns, by name, alias, and values
//   applyMapping data rows -> rows keyed by column name
//   runImport    rows -> validated, merged, and the next dataset
//
// Nothing here touches storage: the caller shows the report as a preview and
// saves the dataset only when the owner says so.

import Papa from 'papaparse';
import type { TerritoryConfig } from '../config/territories';
import type { Dataset, Provenance, TableName } from '../data/types';
import { OP_ID, text } from './fields';
import { relinkOwners } from '../data/edit';
import { Resolver, type Created, type Match } from './resolve';
import { COLUMNS, describeKey, JSON_ONLY, keyOf, PARSERS, RowReader, type Issue, type Raw } from './tables';

export interface ImportReport {
  table: TableName;
  fileName: string;
  /** Problems with the source as a whole, such as a missing required column. Nothing imports. */
  fileErrors: string[];
  added: number;
  updated: number;
  /** Rows already present before the import that the source did not mention. */
  kept: number;
  removed: number;
  rejected: Issue[];
  rejectedRows: number;
  warnings: Issue[];
  ignoredColumns: string[];
  /** Companies and contacts the rows named for the first time, added alongside. */
  created: Created[];
  /** Names that matched a stored record spelled differently, such as "Acme Corp" to "ACME Corporation". */
  matches: Match[];
}

export interface ImportResult {
  /** Every table after the import, ready to save. Null when the source could not be read. */
  data: Dataset | null;
  report: ImportReport;
}

export interface ImportOptions {
  /** Replace every row in the table instead of merging by key. */
  replace?: boolean;
  /** Today's date, YYYY-MM-DD; deals without an as_of get it. */
  today?: string;
  /** Whether names with no match create companies and contacts. Defaults to true. */
  create?: boolean;
}

export function newReport(table: TableName, fileName: string): ImportReport {
  return {
    table,
    fileName,
    fileErrors: [],
    added: 0,
    updated: 0,
    kept: 0,
    removed: 0,
    rejected: [],
    rejectedRows: 0,
    warnings: [],
    ignoredColumns: [],
    created: [],
    matches: [],
  };
}

// ---------------------------------------------------------------------------
// Reading

export type Cell = string | number | boolean | Date | null;

export interface Sheet {
  name: string;
  rows: Cell[][];
}

export type Source =
  | { kind: 'sheets'; fileName: string; sheets: Sheet[] }
  | { kind: 'json'; fileName: string; items: unknown[] }
  | { kind: 'error'; fileName: string; error: string };

/** Reads delimited text: a CSV file, or rows copied out of Excel (tab separated). */
export function readDelimited(text_: string, fileName: string): Source {
  const parsed = Papa.parse<string[]>(text_.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const rows = parsed.data.map((r) => r.map((c) => (c === '' ? null : c)));
  if (!rows.length) return { kind: 'error', fileName, error: 'There are no rows to read.' };
  return { kind: 'sheets', fileName, sheets: [{ name: fileName, rows }] };
}

export function readJsonText(text_: string, fileName: string, table: TableName): Source {
  let data: unknown;
  try {
    data = JSON.parse(text_.replace(/^﻿/, ''));
  } catch (e) {
    return { kind: 'error', fileName, error: `The file is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    // A list under the table's name, or under a name it used to have.
    const key = [table, ...(LEGACY_JSON_KEYS[table] ?? [])].find((k) => Array.isArray(o[k]));
    if (key) data = o[key];
  }
  if (!Array.isArray(data))
    return { kind: 'error', fileName, error: `The file must hold a list of ${table}, or an object with a "${table}" list.` };
  return { kind: 'json', fileName, items: data };
}

const LEGACY_JSON_KEYS: Partial<Record<TableName, string[]>> = { contacts: ['stakeholders'], companies: ['prospects'] };

/** Reads an .xlsx workbook. The Excel reader loads only when someone imports a workbook. */
export async function readWorkbook(buffer: ArrayBuffer, fileName: string): Promise<Source> {
  try {
    const { default: readExcelFile } = await import('read-excel-file/universal');
    const sheets = (await readExcelFile(buffer)) as { sheet: string; data: Cell[][] }[];
    // Empty rows stay, so row numbers in the report match the ones Excel shows.
    const usable = sheets.map((s) => ({ name: s.sheet, rows: s.data }));
    if (!usable.some((s) => s.rows.some((r) => r.some((c) => c !== null && c !== '')))) {
      return { kind: 'error', fileName, error: 'The workbook has no rows in any sheet.' };
    }
    return { kind: 'sheets', fileName, sheets: usable };
  } catch (e) {
    return {
      kind: 'error',
      fileName,
      error: `The workbook could not be read (${e instanceof Error ? e.message : String(e)}). Save it as .xlsx, or as CSV, and try again.`,
    };
  }
}

/** Reads a chosen file by its extension. */
export async function readFile(
  file: { name: string; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> },
  table: TableName,
): Promise<Source> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return readWorkbook(await file.arrayBuffer(), file.name);
  if (name.endsWith('.xls')) {
    return {
      kind: 'error',
      fileName: file.name,
      error: 'This is an old .xls workbook. Open it in Excel and save it as .xlsx, then import that.',
    };
  }
  if (name.endsWith('.json')) return readJsonText(await file.text(), file.name, table);
  return readDelimited(await file.text(), file.name);
}

// ---------------------------------------------------------------------------
// Header row and column mapping

export interface Tabular {
  /** 1-based row number of the header in the sheet. */
  headerRow: number;
  headers: string[];
  rows: { row: number; cells: Cell[] }[];
}

/**
 * The header row: the first of the top ten rows with at least two filled
 * cells, all of them text, and at least half as many as the widest row has.
 * Title rows above a report's headers are skipped this way.
 */
export function guessHeaderRow(rows: Cell[][]): number {
  const filled = (r: Cell[]) => r.filter((c) => c !== null && c !== '').length;
  const widest = Math.max(0, ...rows.slice(0, 50).map(filled));
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i]!;
    const n = filled(r);
    if (n >= 2 && n >= widest / 2 && r.every((c) => c === null || c === '' || typeof c === 'string')) return i + 1;
  }
  return 1;
}

export function tabulate(sheet: Sheet, headerRow = guessHeaderRow(sheet.rows)): Tabular {
  const header = sheet.rows[headerRow - 1] ?? [];
  const width = Math.max(header.length, ...sheet.rows.slice(headerRow).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => text(header[i] ?? '') || `Column ${columnLetter(i)}`);
  const rows = sheet.rows
    .slice(headerRow)
    .map((cells, i) => ({ row: headerRow + i + 1, cells }))
    .filter((r) => r.cells.some((c) => c !== null && text(c) !== ''));
  return { headerRow, headers, rows };
}

function columnLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Lowercase letters and digits only: "Opportunity ID" and "opportunity_id" both become opportunityid. */
export function headerKey(h: string): string {
  return h
    .replace(/^﻿/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Which column of the table a source column fills, by position. Null skips it. */
export type Mapping = (string | null)[];

function aliasTable(table: TableName): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of COLUMNS[table]) {
    m.set(headerKey(c.name), c.name);
    for (const a of c.aliases ?? []) if (!m.has(headerKey(a))) m.set(headerKey(a), c.name);
  }
  return m;
}

/**
 * Maps each source column to a column of the table: by name or alias first,
 * and for deals, a column whose values look like op IDs maps to op_id
 * whatever its header says. Each table column takes at most one source column.
 */
export function autoMap(table: TableName, t: Tabular): Mapping {
  const aliases = aliasTable(table);
  const mapping: Mapping = t.headers.map((h) => aliases.get(headerKey(h)) ?? null);
  if (table === 'deals') {
    t.headers.forEach((_, i) => {
      const values = t.rows
        .slice(0, 50)
        .map((r) => text(r.cells[i]))
        .filter(Boolean);
      if (values.length && values.filter((v) => OP_ID.test(v.toUpperCase().replace(/\s+/g, ''))).length / values.length >= 0.6) {
        for (let j = 0; j < mapping.length; j++) if (mapping[j] === 'op_id') mapping[j] = null;
        mapping[i] = 'op_id';
      }
    });
  }
  const seen = new Set<string>();
  return mapping.map((m) => {
    if (!m || seen.has(m)) return null;
    seen.add(m);
    return m;
  });
}

/** Required columns of the table that no source column fills. */
export function missingRequired(table: TableName, mapping: Mapping): string[] {
  return COLUMNS[table].filter((c) => c.required && !mapping.includes(c.name)).map((c) => c.name);
}

/** The key a saved mapping is stored under: the table and its headers, in order. */
export function layoutKey(table: TableName, headers: string[]): string {
  return `${table}:${headers.map(headerKey).join('|')}`;
}

export interface SourceRow {
  row: number;
  raw: Raw;
}

export function applyMapping(t: Tabular, mapping: Mapping): SourceRow[] {
  return t.rows.map(({ row, cells }) => {
    const raw: Raw = {};
    mapping.forEach((column, i) => {
      if (column) raw[column] = cells[i] ?? null;
    });
    return { row, raw };
  });
}

/** JSON items keyed by column name, through the same aliases as spreadsheet headers. */
export function jsonRows(table: TableName, items: unknown[]): { rows: SourceRow[]; ignored: string[] } {
  const aliases = aliasTable(table);
  const ignored = new Set<string>();
  const rows = items.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { row: i + 1, raw: { __not_object: true } as Raw };
    const raw: Raw = {};
    for (const [k, v] of Object.entries(item as Raw)) {
      const column = aliases.get(headerKey(k));
      if (column && raw[column] === undefined) raw[column] = v;
      else if (k === 'is_sample') raw.is_sample = v;
      else if (!column) ignored.add(k);
    }
    return { row: i + 1, raw };
  });
  return { rows, ignored: [...ignored] };
}

// ---------------------------------------------------------------------------
// Validating and merging

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** One-call import for tests and scripts: a whole CSV or JSON text into a table, with automatic mapping. */
export function importText(
  table: TableName,
  text_: string,
  fileName: string,
  current: Dataset,
  config: TerritoryConfig,
  options: ImportOptions = {},
): ImportResult {
  const source = fileName.toLowerCase().endsWith('.json') ? readJsonText(text_, fileName, table) : readDelimited(text_, fileName);
  return importSource(table, source, current, config, options);
}

/** Imports a read source with automatic mapping (the first sheet of a workbook). */
export function importSource(
  table: TableName,
  source: Source,
  current: Dataset,
  config: TerritoryConfig,
  options: ImportOptions = {},
  mapping?: Mapping,
  sheetIndex = 0,
  headerRow?: number,
): ImportResult {
  const report = newReport(table, source.fileName);
  if (source.kind === 'error') {
    report.fileErrors.push(source.error);
    return { data: null, report };
  }
  if (source.kind === 'json') {
    const { rows, ignored } = jsonRows(table, source.items);
    report.ignoredColumns = ignored;
    return runImport(table, rows, report, current, config, options);
  }
  if (JSON_ONLY.has(table)) {
    report.fileErrors.push(`${table} come only as JSON, because each one holds lists of items.`);
    return { data: null, report };
  }
  const sheet = source.sheets[sheetIndex] ?? source.sheets[0]!;
  const t = tabulate(sheet, headerRow);
  const map = mapping ?? autoMap(table, t);
  const missing = missingRequired(table, map);
  if (missing.length) {
    report.fileErrors.push(
      `No column is matched to ${missing.join(', ')}. ${table} need: ${COLUMNS[table]
        .filter((c) => c.required)
        .map((c) => c.name)
        .join(', ')}.`,
    );
  }
  report.ignoredColumns = t.headers.filter((h, i) => !map[i] && !/^Column [A-Z]+$/.test(h));
  if (!t.rows.length && !report.fileErrors.length) report.fileErrors.push('There is a header row but no data rows under it.');
  if (report.fileErrors.length) return { data: null, report };
  return runImport(table, applyMapping(t, map), report, current, config, options);
}

/**
 * Validates rows keyed by column name and merges them into the table, along
 * with any companies and contacts the rows named for the first time. Used by
 * every import and by restoring a backup.
 */
export function runImport(
  table: TableName,
  source: SourceRow[],
  report: ImportReport,
  current: Dataset,
  config: TerritoryConfig,
  options: ImportOptions = {},
): ImportResult {
  const fileName = report.fileName;
  const spec = COLUMNS[table];
  const provenance: Provenance = { source: `import: ${fileName}`, verified_at: null, updated_by: 'import' };
  const resolver = new Resolver(current, provenance, options.create ?? true);
  const ctxBase = { current, config, fileName, today: options.today ?? todayString(), resolver };

  const parse = PARSERS[table] as unknown as (r: RowReader, ctx: Parameters<(typeof PARSERS)[TableName]>[1]) => Dataset[TableName][number];
  const accepted = new Map<string, { row: number; value: Dataset[TableName][number]; raw: Raw }>();
  const badRows = new Set<number>(report.rejected.map((r) => r.row));

  for (const { row, raw } of source) {
    if (raw.__not_object) {
      report.rejected.push({ row, column: '', reason: 'This item is not an object.' });
      badRows.add(row);
      continue;
    }
    if (badRows.has(row)) continue;
    const reader = new RowReader(raw);
    const rowWarnings: Issue[] = [];
    resolver.begin();
    const value = parse(reader, { ...ctxBase, warn: (column, reason) => rowWarnings.push({ row, column, reason }) });
    for (const c of spec) {
      if (c.required && raw[c.name] === undefined && !reader.problems.some((p) => p.column === c.name))
        reader.fail(c.name, `${c.name} is missing`);
    }
    if (!reader.problems.length) {
      const earlier = accepted.get(keyOf(table, value as never));
      if (earlier) reader.fail('', `${describeKey(table, value, (id) => resolver.companyName(id))} already appears on row ${earlier.row}`);
    }
    if (reader.problems.length) {
      resolver.rollback();
      for (const p of reader.problems) report.rejected.push({ row, column: p.column, reason: p.reason });
      badRows.add(row);
      continue;
    }
    resolver.commit();
    accepted.set(keyOf(table, value as never), { row, value, raw });
    report.warnings.push(...rowWarnings);
  }
  report.rejectedRows = badRows.size;

  // Merge by key, or replace the table outright.
  const existing = current[table] as Dataset[TableName][number][];
  const existingKeys = new Set(existing.map((r) => keyOf(table, r as never)));
  let rows: Dataset[TableName][number][];
  if (options.replace) {
    rows = [...accepted.values()].map((a) => a.value);
    report.added = rows.filter((r) => !existingKeys.has(keyOf(table, r as never))).length;
    report.updated = rows.length - report.added;
    report.removed = existing.filter((r) => !accepted.has(keyOf(table, r as never))).length;
  } else {
    rows = existing.map((r) => {
      const hit = accepted.get(keyOf(table, r as never));
      return hit ? mergeRecord(table, r, hit.value, hit.raw) : r;
    });
    for (const [key, a] of accepted) if (!existingKeys.has(key)) rows.push(a.value);
    report.updated = [...accepted.keys()].filter((k) => existingKeys.has(k)).length;
    report.added = accepted.size - report.updated;
    report.kept = existing.length - report.updated;
  }

  const next: Dataset = { ...current, [table]: rows };
  // A company or contact a row named before the file's own row for it gives way to that row.
  const fileIds = table === 'companies' || table === 'contacts' ? new Set(accepted.keys()) : new Set<string>();
  const newCompanies = resolver.newCompanies.filter((c) => !(table === 'companies' && fileIds.has(c.id)));
  const newContacts = resolver.newContacts.filter((c) => !(table === 'contacts' && fileIds.has(c.id)));
  if (newCompanies.length) next.companies = [...next.companies, ...newCompanies];
  if (newContacts.length) next.contacts = [...next.contacts, ...newContacts];
  report.created = resolver.created.filter((c) => !(c.table === table && fileIds.has(c.id)));
  report.matches = resolver.matches;

  if (table === 'contacts') checkReportsTo(next.contacts, accepted as never, report);
  return { data: relinkOwners(next), report };
}

/** The import column each stored field comes from, where the names differ. */
const FIELD_COLUMN: Partial<Record<TableName, Record<string, string>>> = {
  companies: { primary_partner_id: 'primary_partner', hpe_owner_id: 'hpe_owner' },
  contacts: { company_id: 'company' },
  deals: { company_id: 'company', partner_id: 'partner', hpe_owner_id: 'hpe_owner', owner_name: 'hpe_owner', contact_ids: 'contacts' },
  people: { roles: 'role' },
  coverage: { person_id: 'person', company_id: 'company' },
  briefs: { company_id: 'company' },
};

function blank(v: unknown): boolean {
  return v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : text(v) === '');
}

/**
 * An updated row over the stored one. A column the source does not have, or
 * an empty cell, leaves the stored value alone, so an import never blanks a
 * field someone filled in. A deal's as_of always moves to the import's.
 */
function mergeRecord<T extends object>(table: TableName, stored: T, incoming: T, raw: Raw): T {
  const out = { ...incoming } as Record<string, unknown>;
  const columns = FIELD_COLUMN[table] ?? {};
  for (const [field, value] of Object.entries(stored)) {
    if (field === 'as_of' || field === 'source' || field === 'updated_by') continue;
    const column = columns[field] ?? field;
    if (column in COLUMN_NAMES[table] && blank(raw[column])) out[field] = value;
  }
  if ((stored as { is_sample?: boolean }).is_sample) out.is_sample = true;
  return out as T;
}

const COLUMN_NAMES = Object.fromEntries(
  Object.entries(COLUMNS).map(([t, cols]) => [t, Object.fromEntries(cols.map((c) => [c.name, true]))]),
) as Record<TableName, Record<string, true>>;

/** A reports_to that points nowhere, or at someone at another company, is kept but flagged. */
function checkReportsTo(
  all: Dataset['contacts'],
  accepted: Map<string, { row: number; value: Dataset['contacts'][number] }>,
  report: ImportReport,
) {
  const byId = new Map(all.map((s) => [s.id, s]));
  for (const { row, value } of accepted.values()) {
    if (!value.reports_to) continue;
    const boss = byId.get(value.reports_to);
    if (!boss)
      report.warnings.push({
        row,
        column: 'reports_to',
        reason: `reports_to ${value.reports_to} is not a known contact; ${value.name} shows at the top of the org chart`,
      });
    else if (boss.company_id !== value.company_id) {
      report.warnings.push({ row, column: 'reports_to', reason: `${boss.name} works at another company` });
    }
  }
}

/** Guesses the table from a file or sheet name, such as people.csv, Pipeline.xlsx, or acme-briefs.json. */
export function guessTable(name: string): TableName | null {
  const n = name.toLowerCase();
  const rules: [TableName, RegExp][] = [
    ['briefs', /brief/],
    ['coverage', /coverage/],
    ['contacts', /contact|stakeholder/],
    ['deals', /deal|pipeline|opportunit|forecast|opp/],
    ['people', /people|team|hpe/],
    ['companies', /compan|account|prospect|partner|customer/],
  ];
  return rules.find(([, re]) => re.test(n))?.[0] ?? null;
}

/** Guesses the table from a sheet's headers when its name says nothing: the table whose columns match most. */
export function guessTableFromHeaders(headers: string[]): TableName {
  let best: TableName = 'deals';
  let bestScore = -1;
  for (const table of ['deals', 'contacts', 'companies', 'people', 'coverage'] as TableName[]) {
    const aliases = aliasTable(table);
    const score = new Set(headers.map((h) => aliases.get(headerKey(h))).filter(Boolean)).size;
    if (score > bestScore) {
      best = table;
      bestScore = score;
    }
  }
  return best;
}
