import { describe, expect, it } from 'vitest';
import rawConfig from '../config/territories.json';
import { parseTerritoryConfig } from '../src/config/territories';
import {
  companyDeleteImpact,
  contactDeleteImpact,
  deleteCompany,
  deleteContact,
  deleteDeal,
  deletePerson,
  personDeleteImpact,
  saveCompany,
  saveContact,
  saveDeal,
  savePerson,
  sortRows,
} from '../src/data/edit';
import type { Dataset } from '../src/data/types';

const config = parseTerritoryConfig(rawConfig);
const ctx = { config, editor: 'Sample Editor', today: '2026-10-08' };

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
    const r = savePerson(
      await sample(),
      null,
      personForm({ name: '', email: 'nope', role: [], states: 'Narnia', verified_at: '2026-13-01' }),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['email', 'name', 'role', 'states', 'verified_at']);
  });

  it('carries a changed email over to coverage, company owners, and deal owners', async () => {
    const d = await sample();
    const owner = d.deals.find((x) => x.hpe_owner_email)!.hpe_owner_email!;
    const p = d.people.find((x) => x.email === owner)!;
    const r = savePerson(
      d,
      owner,
      personForm({ name: p.name, email: 'moved@example.com', role: p.roles, states: p.states.join(';') }),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.deals.some((x) => x.hpe_owner_email === owner)).toBe(false);
    expect(r.data.deals.some((x) => x.hpe_owner_email === 'moved@example.com')).toBe(true);
    expect(r.data.coverage.some((c) => c.person_email === owner)).toBe(false);
    expect(r.data.companies.some((c) => c.hpe_owner_email === owner)).toBe(false);
    expect(r.record.is_sample).toBe(true);
  });
});

describe('deleting a person', () => {
  it('removes coverage links, clears company owners, and keeps the name on deals as text', async () => {
    const d = await sample();
    const owner = d.deals.find((x) => x.hpe_owner_email)!.hpe_owner_email!;
    const impact = personDeleteImpact(d, owner);
    expect(impact.deals).toBeGreaterThan(0);
    const next = deletePerson(d, owner);
    const name = d.people.find((p) => p.email === owner)!.name;
    expect(next.coverage.some((c) => c.person_email === owner)).toBe(false);
    expect(next.deals.filter((x) => x.owner_name === name)).toHaveLength(impact.deals);
  });
});

describe('saving a company', () => {
  const form = (patch: Record<string, unknown> = {}) => ({
    name: 'Sample Co New',
    type: 'prospect',
    state: 'Oregon',
    lat: '',
    lng: '',
    segment: '',
    tier_fit: 'vme',
    primary_partner: 'sample-partner-1',
    hpe_owner: '',
    ...patch,
  });

  it('adds a company with an id made from its name', async () => {
    const r = saveCompany(await sample(), null, form(), ctx);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.record).toMatchObject({ id: 'sample-co-new', state: 'US-OR', primary_partner_id: 'sample-partner-1', segment: null });
  });

  it('refuses a new company with the name of one already there', async () => {
    const r = saveCompany(await sample(), null, form({ name: 'SAMPLE CO 1, Inc.' }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toContain('already in Companies');
  });

  it('keeps the id when the name changes, and refuses a partner that is not a company', async () => {
    const d = await sample();
    const renamed = saveCompany(d, 'sample-co-1', form({ name: 'Renamed Co' }), ctx);
    expect(renamed.ok && renamed.record.id).toBe('sample-co-1');
    const bad = saveCompany(d, 'sample-co-1', form({ primary_partner: 'no-such-partner' }), ctx);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.primary_partner).toContain('not a known company');
  });
});

describe('deleting a company', () => {
  it('deletes its contacts, deals, coverage, and brief, and clears it as a partner', async () => {
    const d = await sample();
    const target = d.briefs[0]!.company_id;
    const impact = companyDeleteImpact(d, target);
    expect(impact.contacts).toBeGreaterThan(0);
    const next = deleteCompany(d, target);
    expect(next.contacts.some((c) => c.company_id === target)).toBe(false);
    expect(next.briefs.some((b) => b.company_id === target)).toBe(false);
    expect(next.companies).toHaveLength(d.companies.length - 1);

    const partnerId = d.deals.find((x) => x.partner_id)!.partner_id!;
    const afterPartner = deleteCompany(d, partnerId);
    expect(afterPartner.deals.some((x) => x.partner_id === partnerId)).toBe(false);
    expect(afterPartner.companies.some((c) => c.primary_partner_id === partnerId)).toBe(false);
    expect(afterPartner.contacts.some((c) => c.company_id === partnerId)).toBe(false);
  });
});

describe('contacts', () => {
  it('adds a contact at a company and refuses a duplicate name there', async () => {
    const d = await sample();
    const form = {
      company: 'sample-co-2',
      name: 'Sample Contact New',
      title: 'CIO',
      email: 'NEW@example.com',
      role_in_decision: 'champion',
    };
    const r = saveContact(d, null, form, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record).toMatchObject({ id: 'sample-co-2-sample-contact-new', email: 'new@example.com', company_id: 'sample-co-2' });
    const again = saveContact(r.data, null, form, ctx);
    expect(again.ok).toBe(false);
  });

  it('moves reports to the top of the org chart and off deals when a contact is deleted', async () => {
    const d = await sample();
    const boss = d.contacts.find((c) => d.contacts.some((x) => x.reports_to === c.id) && d.deals.some((x) => x.contact_ids.includes(c.id)));
    if (!boss) throw new Error('sample data has no contact who is both a manager and on a deal');
    const impact = contactDeleteImpact(d, boss.id);
    expect(impact.reports).toBeGreaterThan(0);
    const next = deleteContact(d, boss.id);
    expect(next.contacts.some((c) => c.reports_to === boss.id)).toBe(false);
    expect(next.deals.some((x) => x.contact_ids.includes(boss.id))).toBe(false);
  });
});

describe('deals', () => {
  const form = (patch: Record<string, unknown> = {}) => ({
    company: 'sample-co-3',
    name: 'New pilot',
    op_id: '',
    stage: 'Qualify',
    amount: '$75,000',
    close_date: '2027-03-31',
    hpe_owner: '',
    partner: '',
    contacts: [],
    as_of: '2026-10-08',
    ...patch,
  });

  it('adds a deal without an op ID, keyed on company and name', async () => {
    const r = saveDeal(await sample(), null, form(), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record).toMatchObject({ id: 'sample-co-3--new-pilot', op_id: null, amount: 75000 });
  });

  it('refuses an op ID another deal has, and keeps an unknown owner as text', async () => {
    const d = await sample();
    const taken = d.deals.find((x) => x.op_id)!.op_id!;
    const dup = saveDeal(d, null, form({ op_id: taken }), ctx);
    expect(dup.ok).toBe(false);
    const named = saveDeal(d, null, form({ hpe_owner: 'Sample Person Nobody' }), ctx);
    expect(named.ok && named.record.owner_name).toBe('Sample Person Nobody');
  });

  it('edits a deal in place and deletes it', async () => {
    const d = await sample();
    const target = d.deals[0]!;
    const r = saveDeal(d, target.id, form({ company: target.company_id, stage: 'Commit', op_id: target.op_id ?? '' }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.deals).toHaveLength(d.deals.length);
    expect(r.data.deals.find((x) => x.id === target.id)!.stage).toBe('Commit');
    expect(deleteDeal(r.data, target.id).deals).toHaveLength(d.deals.length - 1);
  });
});

describe('sorting', () => {
  it('sorts naturally with empty values last both ways', () => {
    const rows = ['Co 10', '', 'Co 2', 'co 1'];
    expect(sortRows(rows, (r) => r, 'asc')).toEqual(['co 1', 'Co 2', 'Co 10', '']);
    expect(sortRows(rows, (r) => r, 'desc')).toEqual(['Co 10', 'Co 2', 'co 1', '']);
    expect(sortRows([3, null, 1] as (number | null)[], (r) => r, 'asc')).toEqual([1, 3, null]);
  });
});
