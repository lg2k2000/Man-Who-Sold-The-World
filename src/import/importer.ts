// Turns an import file into validated rows and a report of every row that
// was rejected and why. Nothing here touches storage: the caller decides
// whether to save the result.

import Papa from 'papaparse';
import type { TerritoryConfig } from '../config/territories';
import type { Dataset, TableName } from '../data/types';
import { COLUMNS, FILE_FORMAT, keyOf, PARSERS, RowReader, type Issue, type Raw } from './tables';

export interface ImportReport {
  table: TableName;
  fileName: string;
  /** Problems with the file as a whole, such as a missing required column. Nothing imports. */
  fileErrors: string[];
  added: number;
  updated: number;
  /** Rows already present before the import that the file did not mention. */
  kept: number;
  removed: number;
  rejected: Issue[];
  rejectedRows: number;
  warnings: Issue[];
  ignoredColumns: string[];
}

export interface ImportResult<T extends TableName> {
  /** The whole table after the import, ready to save. Null when the file could not be read. */
  rows: Dataset[T] | null;
  report: ImportReport;
}

export interface ImportOptions {
  /** Replace every row in the table instead of merging by key. */
  replace?: boolean;
}

/** Lowercases headers and turns spaces and hyphens into underscores: "Person Email" becomes person_email. */
export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export interface SourceRow {
  row: number;
  raw: Raw;
}

function readCsv(text: string): { rows: SourceRow[]; headers: string[]; errors: Issue[] } {
  const parsed = Papa.parse<Raw>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  });
  const errors: Issue[] = parsed.errors
    .filter((e) => e.code !== 'UndetectableDelimiter')
    .map((e) => ({ row: (e.row ?? 0) + 2, column: '', reason: `The CSV could not be read here: ${e.message}` }));
  return {
    rows: parsed.data.map((raw, i) => ({ row: i + 2, raw })),
    headers: parsed.meta.fields ?? [],
    errors,
  };
}

function readJson(text: string, table: TableName): { rows: SourceRow[]; headers: string[]; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return { rows: [], headers: [], error: `The file is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as Record<string, unknown>)[table])) {
    data = (data as Record<string, unknown>)[table];
  }
  if (!Array.isArray(data)) return { rows: [], headers: [], error: `The file must hold a list of ${table}, or an object with a "${table}" list.` };
  const rows: SourceRow[] = data.map((item, i) => ({
    row: i + 1,
    raw: item && typeof item === 'object' && !Array.isArray(item) ? normalizeKeys(item as Raw) : { __not_object: true },
  }));
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r.raw)))];
  return { rows, headers };
}

function normalizeKeys(o: Raw): Raw {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [normalizeHeader(k), v]));
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
  };
}

export function importTable<T extends TableName>(
  table: T,
  text: string,
  fileName: string,
  current: Dataset,
  config: TerritoryConfig,
  options: ImportOptions = {},
): ImportResult<T> {
  const report = newReport(table, fileName);
  const format = FILE_FORMAT[table];
  let source: SourceRow[];
  let headers: string[];
  if (format === 'csv') {
    const csv = readCsv(text);
    source = csv.rows;
    headers = csv.headers;
    report.rejected.push(...csv.errors);
  } else {
    const json = readJson(text, table);
    if (json.error) report.fileErrors.push(json.error);
    source = json.rows;
    headers = json.headers;
  }

  const spec = COLUMNS[table];
  const known = new Set(spec.map((c) => c.name));
  if (format === 'csv' || source.length > 0) {
    const missing = spec.filter((c) => c.required && !headers.includes(c.name)).map((c) => c.name);
    // In JSON a missing key is a per-item problem; in CSV a missing column is the whole file's.
    if (format === 'csv' && missing.length) {
      report.fileErrors.push(`The file has no ${missing.join(', ')} column${missing.length > 1 ? 's' : ''}. ${table} files need: ${spec.filter((c) => c.required).map((c) => c.name).join(', ')}.`);
    }
  }
  report.ignoredColumns = headers.filter((h) => !known.has(h) && h !== '__not_object');
  if (format === 'csv' && source.length === 0 && !report.fileErrors.length) report.fileErrors.push('The file has a header row but no data rows.');
  if (report.fileErrors.length) return { rows: null, report };
  return validateRows(table, source, report, current, config, options);
}

/**
 * Validates parsed rows and merges them into the table. Used by file imports
 * and by restoring a backup, whose rows arrive already parsed.
 */
export function validateRows<T extends TableName>(
  table: T,
  source: SourceRow[],
  report: ImportReport,
  current: Dataset,
  config: TerritoryConfig,
  options: ImportOptions = {},
): ImportResult<T> {
  const fileName = report.fileName;
  const format = FILE_FORMAT[table];
  const spec = COLUMNS[table];

  const parse = PARSERS[table] as unknown as (r: RowReader, ctx: Parameters<(typeof PARSERS)[T]>[1]) => Dataset[T][number];
  const accepted = new Map<string, { row: number; value: Dataset[T][number] }>();
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
    const value = parse(reader, {
      current,
      config,
      fileName,
      warn: (column, reason) => rowWarnings.push({ row, column, reason }),
    });
    if (format === 'json') {
      for (const c of spec) if (c.required && raw[c.name] === undefined && !reader.problems.some((p) => p.column === c.name)) {
        reader.fail(c.name, `${c.name} is missing`);
      }
    }
    if (reader.problems.length) {
      for (const p of reader.problems) report.rejected.push({ row, column: p.column, reason: p.reason });
      badRows.add(row);
      continue;
    }
    const key = keyOf(table, value);
    const earlier = accepted.get(key);
    if (earlier) {
      report.rejected.push({
        row,
        column: keyColumn(table),
        reason: `${keyColumn(table)} ${key} already appears on row ${earlier.row} of this file`,
      });
      badRows.add(row);
      continue;
    }
    accepted.set(key, { row, value });
    report.warnings.push(...rowWarnings);
  }
  report.rejectedRows = badRows.size;

  // Merge by key, or replace the table outright.
  const existing = current[table] as Dataset[T][number][];
  const existingKeys = new Set(existing.map((r) => keyOf(table, r)));
  let rows: Dataset[T][number][];
  if (options.replace) {
    rows = [...accepted.values()].map((a) => a.value);
    report.added = rows.filter((r) => !existingKeys.has(keyOf(table, r))).length;
    report.updated = rows.length - report.added;
    report.removed = existing.filter((r) => !accepted.has(keyOf(table, r))).length;
  } else {
    rows = existing.map((r) => {
      const hit = accepted.get(keyOf(table, r));
      return hit ? hit.value : r;
    });
    for (const [key, a] of accepted) if (!existingKeys.has(key)) rows.push(a.value);
    report.updated = [...accepted.keys()].filter((k) => existingKeys.has(k)).length;
    report.added = accepted.size - report.updated;
    report.kept = existing.length - report.updated;
  }

  if (table === 'stakeholders') checkReportsTo(rows as Dataset['stakeholders'], accepted as never, report);
  return { rows: rows as Dataset[T], report };
}

function keyColumn(table: TableName): string {
  return { people: 'email', coverage: 'person_email and prospect_id', partners: 'id', prospects: 'id', deals: 'op_id', briefs: 'prospect_id', stakeholders: 'id' }[table];
}

/** A reports_to that points nowhere, or at another prospect's stakeholder, is kept but flagged. */
function checkReportsTo(
  all: Dataset['stakeholders'],
  accepted: Map<string, { row: number; value: Dataset['stakeholders'][number] }>,
  report: ImportReport,
) {
  const byId = new Map(all.map((s) => [s.id, s]));
  for (const { row, value } of accepted.values()) {
    if (!value.reports_to) continue;
    const boss = byId.get(value.reports_to);
    if (!boss) report.warnings.push({ row, column: 'reports_to', reason: `reports_to ${value.reports_to} is not a known stakeholder; ${value.name} shows at the top of the tree` });
    else if (boss.prospect_id !== value.prospect_id) {
      report.warnings.push({ row, column: 'reports_to', reason: `reports_to ${value.reports_to} belongs to ${boss.prospect_id}, not ${value.prospect_id}` });
    }
  }
}

/** Guesses the table from a file's name, such as people.csv or acme-briefs.json. */
export function guessTable(fileName: string): TableName | null {
  const n = fileName.toLowerCase();
  const order: TableName[] = ['stakeholders', 'coverage', 'partners', 'prospects', 'people', 'deals', 'briefs'];
  return order.find((t) => n.includes(t.replace(/s$/, ''))) ?? null;
}
