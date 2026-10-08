import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import rawConfig from '../config/territories.json';
import { parseTerritoryConfig } from '../src/config/territories';
import { IndexedDbStore } from '../src/data/idb';
import { migrateV1, type V1Dataset } from '../src/data/migrate';
import { MemoryStore } from '../src/data/store';
import { emptyDataset, TABLES, type Dataset } from '../src/data/types';
import { BACKUP_FORMAT, makeBackup, restoreBackup } from '../src/import/backup';

const config = parseTerritoryConfig(rawConfig);
const prov = { source: 't', verified_at: null, updated_by: 't' };

async function sample(): Promise<Dataset> {
  return structuredClone((await import('../fixtures/sample/dataset.json')).default as unknown as Dataset);
}

/** A small dataset in the first version's shape. */
function v1(): V1Dataset {
  return {
    people: [
      {
        email: 'a@example.com',
        name: 'Sample Person A',
        roles: ['eam'],
        specialty: null,
        territories: [],
        states: ['US-WA'],
        notes: '',
        ...prov,
      },
    ],
    partners: [
      {
        id: 'sample-co-1',
        name: 'Sample Partner 1',
        states: ['US-WA'],
        has_done_vme: 'yes',
        has_done_morpheus_enterprise: 'unknown',
        contacts: [{ name: 'Sample Contact P', title: 'AE', email: 'p@example.com' }],
        notes: '',
        ...prov,
        is_sample: true,
      },
    ],
    prospects: [
      {
        id: 'sample-co-1',
        name: 'Sample Co 1',
        hq_city: 'Seattle',
        state: 'US-WA',
        lat: 47.6,
        lng: -122.3,
        industry: '',
        description: '',
        segment: 'enterprise',
        tier_fit: 'vme',
        primary_partner_id: 'sample-co-1',
        hpe_owner_email: 'a@example.com',
        notes: '',
        ...prov,
      },
    ],
    stakeholders: [
      {
        id: 's1',
        prospect_id: 'sample-co-1',
        name: 'Sample Stakeholder 1',
        title: 'CIO',
        reports_to: null,
        role_in_decision: 'champion',
        last_contact: null,
        ...prov,
      },
    ],
    deals: [
      {
        op_id: 'OPE-0000000001',
        prospect_id: 'sample-co-1',
        stage: 'Develop',
        close_date: null,
        hpe_owner_email: 'a@example.com',
        partner_id: 'sample-co-1',
        as_of: '2026-10-01',
        ...prov,
      },
    ],
    coverage: [{ person_email: 'a@example.com', prospect_id: 'sample-co-1', ...prov }],
    briefs: [],
  };
}

describe('moving version 1 data to the CRM model', () => {
  it('turns prospects and partners into companies, renaming a partner whose id a prospect has', () => {
    const d = migrateV1(v1());
    expect(d.companies.map((c) => [c.id, c.type])).toEqual([
      ['sample-co-1', 'prospect'],
      ['sample-co-1-2', 'partner'],
    ]);
    expect(d.companies[0]!.primary_partner_id).toBe('sample-co-1-2');
    expect(d.deals[0]).toMatchObject({ id: 'OPE-0000000001', company_id: 'sample-co-1', partner_id: 'sample-co-1-2', amount: null });
    expect(d.contacts.map((c) => [c.name, c.company_id])).toEqual([
      ['Sample Stakeholder 1', 'sample-co-1'],
      ['Sample Contact P', 'sample-co-1-2'],
    ]);
    expect(d.contacts[1]!.is_sample).toBe(true);
    expect(d.coverage[0]!.company_id).toBe('sample-co-1');
  });

  it('upgrades a browser database saved by version 1', async () => {
    const name = `test-v1-${Math.random()}`;
    const old = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('people', { keyPath: 'email' });
        db.createObjectStore('coverage', { keyPath: ['person_email', 'prospect_id'] });
        db.createObjectStore('partners', { keyPath: 'id' });
        db.createObjectStore('prospects', { keyPath: 'id' });
        db.createObjectStore('briefs', { keyPath: 'prospect_id' });
        db.createObjectStore('stakeholders', { keyPath: 'id' });
        db.createObjectStore('deals', { keyPath: 'op_id' });
      },
    });
    const data = v1();
    for (const [table, rows] of Object.entries(data)) for (const row of rows as object[]) await old.put(table, row);
    old.close();

    const loaded = await new IndexedDbStore(name).load();
    expect(loaded).toEqual(migrateV1(data));
  });
});

describe('IndexedDB store', () => {
  it('saves and loads every table', async () => {
    const store = new IndexedDbStore(`test-${Math.random()}`);
    const data = await sample();
    await store.replaceAll(data);
    const loaded = await store.load();
    for (const t of TABLES) expect(loaded[t]).toHaveLength(data[t].length);
    expect(loaded.deals.map((d) => d.id).sort()).toEqual(data.deals.map((d) => d.id).sort());
  });

  it('replaces one table without touching the others', async () => {
    const store = new IndexedDbStore(`test-${Math.random()}`);
    const data = await sample();
    await store.replaceAll(data);
    await store.replaceTable('deals', data.deals.slice(0, 2));
    const loaded = await store.load();
    expect(loaded.deals).toHaveLength(2);
    expect(loaded.companies).toHaveLength(data.companies.length);
  });

  it('keys coverage on person and company together', async () => {
    const store = new IndexedDbStore(`test-${Math.random()}`);
    await store.replaceTable('coverage', [
      { person_email: 'a@example.com', company_id: 'co-1', ...prov },
      { person_email: 'a@example.com', company_id: 'co-2', ...prov },
      { person_email: 'b@example.com', company_id: 'co-1', ...prov },
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
    expect(JSON.parse(text)).toMatchObject({ format: BACKUP_FORMAT, version: 2 });
    const restored = restoreBackup(text, 'backup.json', config);
    expect(restored.error).toBeNull();
    expect(restored.reports.flatMap((r) => r.rejected)).toEqual([]);
    for (const t of TABLES) expect(restored.data![t]).toHaveLength(data[t].length);
    const byId = <T extends { id: string }>(rows: T[], id: string) => rows.find((r) => r.id === id);
    expect(restored.data!.people[0]).toEqual(data.people[0]);
    for (const c of data.companies.slice(0, 20)) expect(byId(restored.data!.companies, c.id)).toEqual(c);
    for (const c of data.contacts.slice(0, 20)) expect(byId(restored.data!.contacts, c.id)).toEqual(c);
    for (const x of data.deals) expect(byId(restored.data!.deals, x.id)).toEqual(x);
    expect(restored.data!.briefs[0]).toEqual(data.briefs[0]);
  });

  it('restores a version 1 backup through the same move to the CRM model', () => {
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 1, data: v1() });
    const restored = restoreBackup(text, 'old.json', config);
    expect(restored.error).toBeNull();
    expect(restored.reports.flatMap((r) => r.rejected)).toEqual([]);
    expect(restored.data!.companies).toHaveLength(2);
    expect(restored.data!.deals[0]!.partner_id).toBe('sample-co-1-2');
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
