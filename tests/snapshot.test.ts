import { describe, expect, it } from 'vitest';
import rawConfig from '../config/territories.json';
import { parseTerritoryConfig } from '../src/config/territories';
import { emptyDataset, type Dataset } from '../src/data/types';
import { applySnapshot, hasRealRows, parseSnapshot, shouldAutoApply, SNAPSHOT_FORMAT, type Snapshot } from '../src/import/snapshot';

const config = parseTerritoryConfig(rawConfig);

const snap: Snapshot = {
  id: 'test-1',
  label: 'Sample tracker',
  made: '2026-10-08',
  files: [
    { table: 'people', name: 'team.csv', text: 'name,role,territories\nSample Person A,morpheus,PacNorthwest\n' },
    { table: 'companies', name: 'companies.csv', text: 'name,state,industry\nSample Co 1,WA,Utilities\n' },
    {
      table: 'deals',
      name: 'deals.csv',
      text: 'op_id,name,company,stage,amount,hpe_owner,partner,state\nOPE-0000000001,Pilot,Sample Co 1,Discovery,"$120,000",Sample Person A,Sample Partner 1,WA\n',
    },
  ],
};

async function sample(): Promise<Dataset> {
  return structuredClone((await import('../fixtures/sample/dataset.json')).default as unknown as Dataset);
}

describe('snapshots', () => {
  it('reads a snapshot file and refuses anything else', () => {
    expect(parseSnapshot(JSON.stringify({ format: SNAPSHOT_FORMAT, ...snap }))).toEqual(snap);
    expect(parseSnapshot('<!doctype html><html></html>')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...snap, format: 'something-else' }))).toBeNull();
    const badTable = { format: SNAPSHOT_FORMAT, ...snap, files: [{ table: 'planets', name: 'x.csv', text: '' }] };
    expect(parseSnapshot(JSON.stringify(badTable))).toBeNull();
  });

  it('imports its files in order, linking the deal to the team and the partner', () => {
    const { data, reports } = applySnapshot(emptyDataset(), snap, config, '2026-10-08');
    expect(reports.flatMap((r) => r.rejected)).toEqual([]);
    expect(data.deals[0]).toMatchObject({ op_id: 'OPE-0000000001', amount: 120000, hpe_owner_id: 'person-sample-person-a' });
    expect(data.companies.find((c) => c.name === 'Sample Co 1')).toMatchObject({ state: 'US-WA', industry: 'Utilities' });
    expect(data.companies.find((c) => c.name === 'Sample Partner 1')?.type).toBe('partner');
  });

  it('replaces sample rows and keeps fields a later snapshot leaves empty', async () => {
    const withSample = await sample();
    expect(shouldAutoApply(withSample, snap)).toBe(true);
    const first = applySnapshot(withSample, snap, config, '2026-10-08').data;
    expect(first.companies.some((c) => c.is_sample)).toBe(false);
    expect(hasRealRows(first)).toBe(true);
    expect(shouldAutoApply(first, snap)).toBe(false);

    const later: Snapshot = {
      ...snap,
      id: 'test-2',
      files: [{ table: 'companies', name: 'c.csv', text: 'name,state,industry\nSample Co 1,WA,\n' }],
    };
    const second = applySnapshot(first, later, config, '2026-10-09').data;
    expect(second.companies.find((c) => c.name === 'Sample Co 1')?.industry).toBe('Utilities');
    expect(second.deals).toHaveLength(1);
  });
});
