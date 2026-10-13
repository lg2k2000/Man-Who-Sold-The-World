// A snapshot is a set of import files published next to the app, so a copy of
// the app opens with data already in it. Its files go through the same import
// as files chosen on the Data page, in the order the snapshot lists them.
//
// The repository never holds a snapshot: it carries real data and is published
// only with the owner's private copy of the app. Without one, nothing changes.

import type { TerritoryConfig } from '../config/territories';
import { TABLES, type Dataset, type TableName } from '../data/types';
import { importText, type ImportReport } from './importer';

export const SNAPSHOT_FILE = 'snapshot.json';
export const SNAPSHOT_FORMAT = 'territory-coverage-snapshot';
const APPLIED_KEY = 'tc.snapshot.applied.v1';

export interface SnapshotFile {
  table: TableName;
  /** The file name the import report shows. */
  name: string;
  /** CSV text, header row first. */
  text: string;
}

export interface Snapshot {
  /** Changes with every new snapshot, so a browser loads each one once on its own. */
  id: string;
  /** What it holds, in a few words. */
  label: string;
  /** YYYY-MM-DD. */
  made: string;
  files: SnapshotFile[];
}

/** The snapshot in a file's text, or null when the text is not one. */
export function parseSnapshot(text: string): Snapshot | null {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const s = o as Record<string, unknown>;
  if (s.format !== SNAPSHOT_FORMAT || typeof s.id !== 'string' || !Array.isArray(s.files)) return null;
  const files: SnapshotFile[] = [];
  for (const f of s.files as unknown[]) {
    if (!f || typeof f !== 'object') return null;
    const { table, name, text: body } = f as Record<string, unknown>;
    if (!TABLES.includes(table as TableName) || typeof name !== 'string' || typeof body !== 'string') return null;
    files.push({ table: table as TableName, name, text: body });
  }
  return {
    id: s.id,
    label: typeof s.label === 'string' ? s.label : 'Snapshot',
    made: typeof s.made === 'string' ? s.made : '',
    files,
  };
}

/** The snapshot published next to the page, or null when there is none. */
export async function fetchSnapshot(): Promise<Snapshot | null> {
  try {
    const res = await fetch(SNAPSHOT_FILE, { cache: 'no-cache' });
    if (!res.ok) return null;
    return parseSnapshot(await res.text());
  } catch {
    return null;
  }
}

/** Whether the dataset holds anything besides sample rows. */
export function hasRealRows(d: Dataset): boolean {
  return TABLES.some((t) => (d[t] as { is_sample?: boolean }[]).some((r) => !r.is_sample));
}

/**
 * Imports the snapshot's files over the dataset, the way the Data page
 * imports a file: rows are added or updated, and nothing stored is blanked.
 * Sample rows go first, so real data never mixes with fake.
 */
export function applySnapshot(
  current: Dataset,
  snap: Snapshot,
  config: TerritoryConfig,
  today: string,
): { data: Dataset; reports: ImportReport[] } {
  let data = withoutSampleRows(current);
  const reports: ImportReport[] = [];
  for (const f of snap.files) {
    const result = importText(f.table, f.text, f.name, data, config, { today });
    reports.push(result.report);
    if (result.data) data = result.data;
  }
  return { data, reports };
}

function withoutSampleRows(d: Dataset): Dataset {
  const out = { ...d };
  for (const t of TABLES) (out as Record<TableName, unknown[]>)[t] = (d[t] as { is_sample?: boolean }[]).filter((r) => !r.is_sample);
  return out;
}

/** Whether this browser has loaded this snapshot before. */
export function snapshotApplied(id: string): boolean {
  try {
    return localStorage.getItem(APPLIED_KEY) === id;
  } catch {
    return false;
  }
}

export function markSnapshotApplied(id: string): void {
  try {
    localStorage.setItem(APPLIED_KEY, id);
  } catch {
    // A browser that blocks storage loads the snapshot again next time, which changes nothing.
  }
}

/**
 * Whether to load a snapshot without asking: a browser that has never loaded
 * this one and holds no real rows. A browser with real rows keeps them, and
 * the Data page offers to load the snapshot over them.
 */
export function shouldAutoApply(d: Dataset, snap: Snapshot): boolean {
  return !snapshotApplied(snap.id) && !hasRealRows(d);
}
