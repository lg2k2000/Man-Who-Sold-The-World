import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { DataStore } from './store';
import { migrateV1, migrateV2, type V1Dataset, type V2Dataset } from './migrate';
import { emptyDataset, TABLES, type Dataset, type TableName } from './types';

const DB_NAME = 'territory-coverage';
/**
 * Version 1 held prospects, partners, and stakeholders; version 2 was the CRM
 * model with people keyed by email; version 3 keys people by id.
 */
const DB_VERSION = 3;

/** Key path per table; it matches keyOf() in src/import/tables.ts. */
const KEY_PATHS: Record<TableName, string | string[]> = {
  companies: 'id',
  contacts: 'id',
  deals: 'id',
  people: 'id',
  coverage: ['person_id', 'company_id'],
  briefs: 'company_id',
};

const V1_TABLES = ['people', 'coverage', 'partners', 'prospects', 'briefs', 'stakeholders', 'deals'] as const;

/** Phase 1 storage: everything in this browser's IndexedDB. */
export class IndexedDbStore implements DataStore {
  readonly kind = 'this browser';
  private db: Promise<IDBPDatabase>;

  constructor(name = DB_NAME) {
    this.db = openDB(name, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        // Read an older version's rows before its stores go, then write them back in the current shape.
        const old: Record<string, unknown[]> = {};
        if (oldVersion === 1 || oldVersion === 2) {
          const tables = oldVersion === 1 ? V1_TABLES : TABLES;
          for (const t of tables) if (db.objectStoreNames.contains(t)) old[t] = await tx.objectStore(t as never).getAll();
          for (const name of [...db.objectStoreNames]) db.deleteObjectStore(name);
        }
        for (const t of TABLES) {
          if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: KEY_PATHS[t] });
        }
        const write = tx as unknown as IDBPTransaction<unknown, string[], 'versionchange'>;
        if (oldVersion === 1) await writeAll(write, migrateV1(old as V1Dataset));
        if (oldVersion === 2) await writeAll(write, migrateV2(old as V2Dataset));
      },
    });
  }

  async load(): Promise<Dataset> {
    const db = await this.db;
    const tx = db.transaction(TABLES, 'readonly');
    const data = emptyDataset();
    await Promise.all(
      TABLES.map(async (t) => {
        (data as Record<TableName, unknown[]>)[t] = await tx.objectStore(t).getAll();
      }),
    );
    await tx.done;
    return data;
  }

  async replaceTable<T extends TableName>(table: T, rows: Dataset[T]): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(table, 'readwrite');
    const store = tx.objectStore(table);
    await store.clear();
    for (const row of rows) await store.put(row);
    await tx.done;
  }

  async replaceAll(data: Dataset): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(TABLES, 'readwrite');
    for (const t of TABLES) {
      const store = tx.objectStore(t);
      await store.clear();
      for (const row of data[t]) await store.put(row);
    }
    await tx.done;
  }

  async clear(): Promise<void> {
    await this.replaceAll(emptyDataset());
  }
}

async function writeAll(tx: IDBPTransaction<unknown, string[], 'versionchange'>, data: Dataset) {
  for (const t of TABLES) {
    const store = tx.objectStore(t);
    for (const row of data[t]) await store.put(row);
  }
}

/** Asks the browser not to evict this site's data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Turns a storage failure into a sentence the owner can act on. */
export function describeStorageError(e: unknown): string {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  if (name === 'QuotaExceededError')
    return 'The browser is out of storage space for this site. Delete some data or export a backup and clear old rows.';
  if (name === 'InvalidStateError' || name === 'UnknownError') return 'The browser closed its database. Reload the page and try again.';
  if (name === 'SecurityError') return 'The browser does not allow this site to store data. Check its site data settings.';
  return e instanceof Error ? e.message : String(e);
}
