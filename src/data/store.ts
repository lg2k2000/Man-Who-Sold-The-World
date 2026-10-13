// The one module that touches storage. Components read the dataset through
// the app state and write through a DataStore; nothing else knows where the
// rows live. Phase 1 has an in-memory store (sample data and tests) and, from
// M3, an IndexedDB store. A hosted database later is another implementation.

import { emptyDataset, type Dataset, type TableName } from './types';

export interface DataStore {
  /** Human-readable name, shown in the data view. */
  readonly kind: string;
  load(): Promise<Dataset>;
  /** Replaces every row of one table. */
  replaceTable<T extends TableName>(table: T, rows: Dataset[T]): Promise<void>;
  /** Replaces the whole dataset (restore from a backup file). */
  replaceAll(data: Dataset): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryStore implements DataStore {
  readonly kind = "this tab's memory";
  private data: Dataset;

  constructor(initial: Dataset = emptyDataset()) {
    this.data = structuredClone(initial);
  }

  async load(): Promise<Dataset> {
    return structuredClone(this.data);
  }

  async replaceTable<T extends TableName>(table: T, rows: Dataset[T]): Promise<void> {
    this.data[table] = structuredClone(rows);
  }

  async replaceAll(data: Dataset): Promise<void> {
    this.data = structuredClone(data);
  }

  async clear(): Promise<void> {
    this.data = emptyDataset();
  }
}
