import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import rawConfig from '../config/territories.json';
import { parseTerritoryConfig } from '../src/config/territories';
import { IndexedDbStore } from '../src/data/idb';
import { MemoryStore } from '../src/data/store';
import { emptyDataset, TABLES, type Dataset } from '../src/data/types';
import { BACKUP_FORMAT, makeBackup, restoreBackup } from '../src/import/backup';

const config = parseTerritoryConfig(rawConfig);

async function sample(): Promise<Dataset> {
  return structuredClone((await import('../fixtures/sample/dataset.json')).default as unknown as Dataset);
}

describe('IndexedDB store', () => {
  it('saves and loads every table', async () => {
    const store = new IndexedDbStore(`test-${Math.random()}`);
    const data = await sample();
    await store.replaceAll(data);
    const loaded = await store.load();
    for (const t of TABLES) expect(loaded[t]).toHaveLength(data[t].length);
    expect(loaded.deals.map((d) => d.op_id).sort()).toEqual(data.deals.map((d) => d.op_id).sort());
  });

  it('replaces one table without touching the others', async () => {
    const store = new IndexedDbStore(`test-${Math.random()}`);
    const data = await sample();
    await store.replaceAll(data);
    await store.replaceTable('deals', data.deals.slice(0, 2));
    const loaded = await store.load();
    expect(loaded.deals).toHaveLength(2);
    expect(loaded.prospects).toHaveLength(data.prospects.length);
  });

  it('keys coverage on person and prospect together', async () => {
    const store = new IndexedDbStore(`test-${Math.random()}`);
    const prov = { source: 't', verified_at: null, updated_by: 't' };
    await store.replaceTable('coverage', [
      { person_email: 'a@example.com', prospect_id: 'co-1', ...prov },
      { person_email: 'a@example.com', prospect_id: 'co-2', ...prov },
      { person_email: 'b@example.com', prospect_id: 'co-1', ...prov },
    ]);
    expect((await store.load()).coverage).toHaveLength(3);
  });

  it('clears everything', async () => {
    const store = new IndexedDbStore(`test-${Math.random()}`);
    await store.replaceAll(await sample());
    await store.clear();
    expect(await store.load()).toEqual(emptyDataset());
  });
});

describe('memory store', () => {
  it('hands out copies, so callers cannot change stored rows by accident', async () => {
    const store = new MemoryStore(await sample());
    const a = await store.load();
    a.people[0]!.name = 'changed';
    expect((await store.load()).people[0]!.name).not.toBe('changed');
  });
});

describe('backup', () => {
  it('round-trips the whole sample dataset, sample flags included', async () => {
    const data = await sample();
    const text = makeBackup(data, new Date('2026-10-08T00:00:00Z'));
    expect(JSON.parse(text).format).toBe(BACKUP_FORMAT);
    const restored = restoreBackup(text, 'backup.json', config);
    expect(restored.error).toBeNull();
    expect(restored.reports.flatMap((r) => r.rejected)).toEqual([]);
    for (const t of TABLES) {
      expect(restored.data![t]).toHaveLength(data[t].length);
    }
    expect(restored.data!.people.every((p) => p.is_sample)).toBe(true);
    expect(restored.data!.people[0]).toEqual(data.people[0]);
    expect(restored.data!.partners[0]).toEqual(data.partners[0]);
    expect(restored.data!.briefs[0]).toEqual(data.briefs[0]);
  });

  it('refuses a file that is not a backup', () => {
    expect(restoreBackup('[]', 'x.json', config).error).toContain('not a backup');
    expect(restoreBackup('{', 'x.json', config).error).toContain('not valid JSON');
    const wrongVersion = JSON.stringify({ format: BACKUP_FORMAT, version: 99, data: {} });
    expect(restoreBackup(wrongVersion, 'x.json', config).error).toContain('version 99');
  });

  it('drops rows that fail validation and reports them', async () => {
    const data = await sample();
    data.deals[0]!.op_id = 'OPE-1';
    const restored = restoreBackup(makeBackup(data), 'backup.json', config);
    expect(restored.data!.deals).toHaveLength(data.deals.length - 1);
    expect(restored.reports.find((r) => r.table === 'deals')!.rejected[0]!.column).toBe('op_id');
  });
});
