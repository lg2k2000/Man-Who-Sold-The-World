// One JSON file holding the whole database, to move data between browsers or
// keep a copy. Restoring runs every row through the same checks as an import.

import type { TerritoryConfig } from '../config/territories';
import { migrateV1, migrateV2, type V1Dataset, type V2Dataset } from '../data/migrate';
import { emptyDataset, type Dataset, type TableName } from '../data/types';
import { newReport, runImport, type ImportReport } from './importer';
import type { Raw } from './tables';

export const BACKUP_FORMAT = 'territory-coverage-backup';
/**
 * Version 1 held prospects, partners, and stakeholders; version 2 was the CRM
 * model with people keyed by email; version 3 keys people by id. All three restore.
 */
export const BACKUP_VERSION = 3;

/** Tables restore in this order so every reference has something to point at. */
const RESTORE_ORDER: TableName[] = ['people', 'companies', 'contacts', 'deals', 'coverage', 'briefs'];

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
  if (o.version !== 1 && o.version !== 2 && o.version !== BACKUP_VERSION) {
    return {
      data: null,
      error: `This backup is version ${String(o.version)}; this app reads versions 1 to ${BACKUP_VERSION}.`,
      reports: [],
    };
  }
  if (Object.values(o.data).some((t) => t !== undefined && !Array.isArray(t))) {
    return { data: null, error: 'The backup is damaged: a table is not a list.', reports: [] };
  }
  const tables = (o.version === 1 ? migrateV1(o.data as V1Dataset) : o.version === 2 ? migrateV2(o.data as V2Dataset) : o.data) as Partial<
    Record<TableName, unknown[]>
  >;

  let data = emptyDataset();
  const reports: ImportReport[] = [];
  for (const table of RESTORE_ORDER) {
    let items = tables[table] ?? [];
    // Partners first, so a company's primary partner is there when it is checked.
    if (table === 'companies') items = [...items].sort((a, b) => Number(isPartner(b)) - Number(isPartner(a)));
    const rows = items.map((r, i) => ({ row: i + 1, raw: toRaw(table, r) }));
    const report = newReport(table, fileName);
    if (!rows.length) {
      reports.push(report);
      continue;
    }
    const result = runImport(table, rows, report, data, config, { replace: true, create: false });
    data = result.data ?? data;
    reports.push(result.report);
  }
  return { data, error: null, reports };
}

function isPartner(r: unknown): boolean {
  return !!r && typeof r === 'object' && (r as Raw).type === 'partner';
}

/** Backup rows use stored field names; the import parsers read column names. These differ. */
function toRaw(table: TableName, row: unknown): Raw {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { __not_object: true };
  const r = row as Raw;
  switch (table) {
    case 'people':
      return { ...r, role: r.roles };
    case 'companies':
      return { ...r, primary_partner: r.primary_partner_id, hpe_owner: r.hpe_owner_id };
    case 'contacts':
      return { ...r, company: r.company_id };
    case 'deals':
      return { ...r, company: r.company_id, partner: r.partner_id, hpe_owner: r.hpe_owner_id || r.owner_name, contacts: r.contact_ids };
    case 'coverage':
      return { ...r, person: r.person_id, company: r.company_id };
    case 'briefs':
      return { ...r, company: r.company_id };
  }
}
