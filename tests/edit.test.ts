import { describe, expect, it } from 'vitest';
import rawConfig from '../config/territories.json';
import { parseTerritoryConfig } from '../src/config/territories';
import { deletePartner, deletePerson, partnerDeleteImpact, personDeleteImpact, savePartner, savePerson, sortRows } from '../src/data/edit';
import type { Dataset } from '../src/data/types';

const config = parseTerritoryConfig(rawConfig);
const ctx = { config, editor: 'Sample Editor' };

async function sample(): Promise<Dataset> {
  return structuredClone((await import('../fixtures/sample/dataset.json')).default as unknown as Dataset);
}

const personForm = (patch: Record<string, unknown> = {}) => ({
  name: 'Sample Person New',
  email: 'new@example.com',
  role: ['storage', 'sled'],
  specialty: '',
  territories: [],
  states: 'WA; BC',
  notes: '',
  source: '',
  verified_at: '',
  ...patch,
});

describe('saving a person', () => {
  it('adds a new person with the same rules as an import', async () => {
    const d = await sample();
    const r = savePerson(d, null, personForm(), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record).toMatchObject({
      email: 'new@example.com',
      roles: ['storage', 'sled'],
      states: ['US-WA', 'CA-BC'],
      updated_by: 'Sample Editor',
      source: 'edited in app',
    });
    expect(r.record.is_sample).toBeUndefined();
    expect(r.data.people).toHaveLength(d.people.length + 1);
  });

  it('reports field errors and saves nothing', async () => {
    const d = await sample();
    const r = savePerson(d, null, personForm({ name: '', email: 'nope', role: [], states: 'Narnia', verified_at: '2026-13-01' }), ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['email', 'name', 'role', 'states', 'verified_at']);
  });

  it('refuses an email that belongs to someone else', async () => {
    const d = await sample();
    const other = d.people[1]!.email;
    const r = savePerson(d, d.people[0]!.email, personForm({ email: other }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toContain('already belongs to another person');
  });

  it('carries a changed email over to coverage, prospect owners, and deal owners', async () => {
    const d = await sample();
    const owner = d.prospects.find(
      (p) => p.hpe_owner_email && d.deals.some((x) => x.hpe_owner_email === p.hpe_owner_email),
    )!.hpe_owner_email!;
    const before = personDeleteImpact(d, owner);
    const person = d.people.find((p) => p.email === owner)!;
    const r = savePerson(
      d,
      owner,
      personForm({ name: person.name, email: 'renamed@example.com', role: person.roles, states: person.states.join(';') }),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(personDeleteImpact(r.data, owner)).toEqual({ coverage: 0, prospects: 0, deals: 0 });
    expect(personDeleteImpact(r.data, 'renamed@example.com')).toEqual(before);
    expect(r.record.is_sample).toBe(true);
  });
});

describe('deleting a person', () => {
  it('removes coverage links and clears owner fields', async () => {
    const d = await sample();
    const owner = d.prospects.find((p) => p.hpe_owner_email)!.hpe_owner_email!;
    const impact = personDeleteImpact(d, owner);
    expect(impact.prospects).toBeGreaterThan(0);
    const next = deletePerson(d, owner);
    expect(next.people.some((p) => p.email === owner)).toBe(false);
    expect(next.coverage).toHaveLength(d.coverage.length - impact.coverage);
    expect(next.prospects).toHaveLength(d.prospects.length);
    expect(personDeleteImpact(next, owner)).toEqual({ coverage: 0, prospects: 0, deals: 0 });
  });
});

describe('saving a partner', () => {
  const partnerForm = (patch: Record<string, unknown> = {}) => ({
    id: 'sample-partner-new',
    name: 'Sample Partner New',
    states: 'OR',
    has_done_vme: 'yes',
    has_done_morpheus_enterprise: 'unknown',
    contacts: [{ name: 'Sample Contact', title: 'AE', email: 'C@Example.com' }],
    notes: '',
    source: 'phone call',
    verified_at: '2026-10-08',
    ...patch,
  });

  it('adds a partner with contacts from the form', async () => {
    const r = savePartner(await sample(), null, partnerForm(), ctx);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.record).toMatchObject({
        states: ['US-OR'],
        contacts: [{ email: 'c@example.com' }],
        source: 'phone call',
        verified_at: '2026-10-08',
      });
  });

  it('rejects a contact with a bad email or no name', async () => {
    const d = await sample();
    const bad = savePartner(d, null, partnerForm({ contacts: [{ name: 'Sample Contact', title: '', email: 'not-email' }] }), ctx);
    expect(bad.ok).toBe(false);
    const noName = savePartner(d, null, partnerForm({ contacts: [{ name: '', title: 'AE', email: '' }] }), ctx);
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.errors.contacts).toContain('has no name');
  });

  it('carries a changed id over to prospects and deals', async () => {
    const d = await sample();
    const used = d.deals.find((x) => x.partner_id)!.partner_id!;
    const before = partnerDeleteImpact(d, used);
    const partner = d.partners.find((p) => p.id === used)!;
    const r = savePartner(
      d,
      used,
      partnerForm({ id: 'sample-partner-renamed', name: partner.name, states: partner.states.join(';'), contacts: partner.contacts }),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(partnerDeleteImpact(r.data, used)).toEqual({ prospects: 0, deals: 0 });
    expect(partnerDeleteImpact(r.data, 'sample-partner-renamed')).toEqual(before);
  });

  it('refuses an id that belongs to another partner', async () => {
    const d = await sample();
    const r = savePartner(d, d.partners[0]!.id, partnerForm({ id: d.partners[1]!.id }), ctx);
    expect(r.ok).toBe(false);
  });

  it('deleting a partner clears it from prospects and deals', async () => {
    const d = await sample();
    const used = d.deals.find((x) => x.partner_id)!.partner_id!;
    const next = deletePartner(d, used);
    expect(next.partners).toHaveLength(d.partners.length - 1);
    expect(partnerDeleteImpact(next, used)).toEqual({ prospects: 0, deals: 0 });
    expect(next.deals).toHaveLength(d.deals.length);
  });
});

describe('sorting tables', () => {
  const rows = [{ v: 'Sample Co 10' }, { v: 'sample co 2' }, { v: '' }, { v: 'Sample Co 1' }];

  it('sorts text naturally and ignores case', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual(['Sample Co 1', 'sample co 2', 'Sample Co 10', '']);
  });

  it('keeps empty values last when descending too', () => {
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual(['Sample Co 10', 'sample co 2', 'Sample Co 1', '']);
  });

  it('sorts numbers as numbers', () => {
    const n = [{ v: 10 }, { v: 9 }, { v: null }, { v: 100 }];
    expect(sortRows(n, (r) => r.v, 'asc').map((r) => r.v)).toEqual([9, 10, 100, null]);
  });
});
