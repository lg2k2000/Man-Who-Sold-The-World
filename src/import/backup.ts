// One JSON file holding the whole database, to move data between browsers or
// keep a copy. Restoring runs every row through the same checks as an import.

import type { TerritoryConfig } from '../config/territories';
import { emptyDataset, TABLES, type Dataset, type TableName } from '../data/types';
import { newReport, validateRows, type ImportReport } from './importer';
import type { Raw } from './tables';

export const BACKUP_FORMAT = 'territory-coverage-backup';
export const BACKUP_VERSION = 1;

/** Tables restore in this order so every reference has something to point at. */
const RESTORE_ORDER: TableName[] = ['people', 'partners', 'prospects', 'coverage', 'deals', 'briefs', 'stakeholders'];

export function makeBackup(data: Dataset, now = new Date()): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: now.toISOString(), data }, null, 2) + '\n';
}

export function backupFileName(now = new Date()): string {
  return `territory-coverage-backup-${now.toISOString().slice(0, 10)}.json`;
}

export interface RestoreResult {
  data: Dataset | null;
  error: string | null;
  reports: ImportReport[];
}

export function restoreBackup(text: string, fileName: string, config: TerritoryConfig): RestoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { data: null, error: `The file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`, reports: [] };
  }
  const o = parsed as { format?: unknown; version?: unknown; data?: Record<string, unknown> };
  if (!o || o.format !== BACKUP_FORMAT || typeof o.data !== 'object' || o.data === null) {
    return { data: null, error: 'This is not a backup made by "Export everything".', reports: [] };
  }
  if (o.version !== BACKUP_VERSION) {
    return { data: null, error: `This backup is version ${String(o.version)}; this app reads version ${BACKUP_VERSION}.`, reports: [] };
  }
  if (TABLES.some((t) => o.data![t] !== undefined && !Array.isArray(o.data![t]))) {
    return { data: null, error: 'The backup is damaged: a table is not a list.', reports: [] };
  }

  const data = emptyDataset();
  const reports: ImportReport[] = [];
  for (const table of RESTORE_ORDER) {
    const rows = ((o.data[table] as unknown[]) ?? []).map((r, i) => ({ row: i + 1, raw: toRaw(table, r) }));
    const report = newReport(table, fileName);
    if (!rows.length) {
      reports.push(report);
      continue;
    }
    const result = validateRows(table, rows, report, data, config, { replace: true });
    (data as Record<TableName, unknown>)[table] = result.rows ?? [];
    reports.push(result.report);
  }
  return { data, error: null, reports };
}

/** Backup rows use field names; the import parsers read column names. Only people differ. */
function toRaw(table: TableName, row: unknown): Raw {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { __not_object: true };
  const r = row as Raw;
  if (table === 'people') return { ...r, role: r.roles };
  return r;
}
