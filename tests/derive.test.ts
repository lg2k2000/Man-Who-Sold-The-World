import { describe, expect, it } from 'vitest';
import rawConfig from '../config/territories.json';
import { parseTerritoryConfig } from '../src/config/territories';
import {
  coverageRoles,
  dealLabel,
  filterCompanies,
  hasOverlap,
  indexDataset,
  isOpenDeal,
  isWonDeal,
  money,
  moneyShort,
  NO_FILTERS,
  orgTree,
  ownerName,
  search,
  stageTotals,
  territorySummary,
} from '../src/data/derive';
import { company, contact, dataset, deal, partner, person, prov } from './build';

const config = parseTerritoryConfig(rawConfig);

describe('deal status', () => {
  it('treats Closed, Won, and Lost stages as closed and anything else as open', () => {
    expect(isOpenDeal(deal(1, 'co-1', 'Develop'))).toBe(true);
    expect(isOpenDeal(deal(1, 'co-1', 'Closed Won'))).toBe(false);
    expect(isOpenDeal(deal(1, 'co-1', 'closed lost'))).toBe(false);
    expect(isOpenDeal(deal(1, 'co-1', 'Won'))).toBe(false);
    expect(isOpenDeal(deal(1, 'co-1', 'Commit'))).toBe(true);
    expect(isWonDeal(deal(1, 'co-1', 'Closed Won'))).toBe(true);
    expect(isWonDeal(deal(1, 'co-1', 'Closed Lost'))).toBe(false);
  });
});

describe('overlap rule', () => {
  it('counts distinct account coverage roles, not the EAM or the territory team', () => {
    const people = [
      person('A', ['eam']),
      person('B', ['storage']),
      person('C', ['compute']),
      person('D', ['morpheus']),
      person('E', ['storage']),
    ];
    expect(coverageRoles(people)).toEqual(['storage', 'compute']);
    expect(coverageRoles([...people, person('F', ['zerto'])])).toHaveLength(3);
  });

  it('flags companies through the coverage table', () => {
    const people = [person('A', ['storage']), person('B', ['compute']), person('C', ['zerto'])];
    const d = dataset({
      people,
      companies: [company(1), company(2)],
      coverage: [
        ...people.map((p) => ({ person_email: p.email, company_id: 'co-1', ...prov })),
        { person_email: people[0]!.email, company_id: 'co-2', ...prov },
      ],
    });
    const index = indexDataset(d);
    expect(hasOverlap(index, 'co-1')).toBe(true);
    expect(hasOverlap(index, 'co-2')).toBe(false);
  });
});

describe('map pins and filters', () => {
  const d = dataset({
    companies: [
      company(1, 'US-WA'),
      company(2, 'US-OR', { tier_fit: 'enterprise', primary_partner_id: 'partner-1' }),
      company(3, 'US-CA'),
      company(4, null),
      partner(1, ['US-WA']),
    ],
    deals: [deal(1, 'co-1', 'Develop', { amount: 100000 }), deal(2, 'co-3', 'Closed Won', { amount: 50000, partner_id: 'partner-1' })],
  });
  const index = indexDataset(d);

  it('pins every company with a state except partners', () => {
    expect(filterCompanies(d, index, config, NO_FILTERS).map((c) => c.id)).toEqual(['co-1', 'co-2', 'co-3']);
  });

  it('narrows by territory, tier fit, and open deal', () => {
    expect(filterCompanies(d, index, config, { ...NO_FILTERS, territoryId: 'pacnorthwest' }).map((c) => c.id)).toEqual(['co-1', 'co-2']);
    expect(filterCompanies(d, index, config, { ...NO_FILTERS, tierFit: 'enterprise' }).map((c) => c.id)).toEqual(['co-2']);
    expect(filterCompanies(d, index, config, { ...NO_FILTERS, openDeal: 'yes' }).map((c) => c.id)).toEqual(['co-1']);
    expect(filterCompanies(d, index, config, { ...NO_FILTERS, openDeal: 'no' }).map((c) => c.id)).toEqual(['co-2', 'co-3']);
  });

  it('narrows by partner, as primary partner or as partner on a deal', () => {
    expect(filterCompanies(d, index, config, { ...NO_FILTERS, partnerId: 'partner-1' }).map((c) => c.id)).toEqual(['co-2', 'co-3']);
  });

  it('sums open pipeline per company', () => {
    expect(index.openPipeline.get('co-1')).toBe(100000);
    expect(index.openPipeline.get('co-3')).toBeUndefined();
    expect(index.dealsByPartner.get('partner-1')).toHaveLength(1);
  });
});

describe('territory card summary', () => {
  it('ranks partners by primary-partner count, then VME experience', () => {
    const d = dataset({
      companies: [
        partner(1, ['US-WA'], 'no'),
        partner(2, ['US-OR'], 'yes'),
        partner(3, ['US-CA'], 'yes'),
        company(1, 'US-WA', { primary_partner_id: 'partner-1' }),
      ],
    });
    const s = territorySummary(d, config, 'pacnorthwest');
    expect(s.topPartners.map((p) => [p.partner.id, p.companies])).toEqual([
      ['partner-1', 1],
      ['partner-2', 0],
    ]);
  });

  it('counts companies, open deals, and open pipeline in the territory only', () => {
    const d = dataset({
      companies: [company(1, 'US-WA'), company(2, 'US-CA'), company(3, null)],
      deals: [
        deal(1, 'co-1', 'Develop', { amount: 250000 }),
        deal(2, 'co-1', 'Commit', { amount: null }),
        deal(3, 'co-1', 'Closed Won', { amount: 900000 }),
        deal(4, 'co-2', 'Develop', { amount: 1 }),
      ],
    });
    const s = territorySummary(d, config, 'pacnorthwest');
    expect(s.companies).toBe(1);
    expect(s.openDeals).toBe(2);
    expect(s.pipeline).toBe(250000);
  });
});

describe('deal helpers', () => {
  it('totals deals by stage, open stages first', () => {
    const totals = stageTotals([
      deal(1, 'co-1', 'Closed Won', { amount: 10 }),
      deal(2, 'co-1', 'Develop', { amount: 5 }),
      deal(3, 'co-1', 'Develop', { amount: null }),
      deal(4, 'co-1', 'Qualify', { amount: 1 }),
    ]);
    expect(totals.map((t) => [t.stage, t.count, t.amount])).toEqual([
      ['Develop', 2, 5],
      ['Qualify', 1, 1],
      ['Closed Won', 1, 10],
    ]);
  });

  it('names the owner from the team, or the name the source gave', () => {
    const d = dataset({ people: [person('A', ['eam'])], companies: [company(1)] });
    const index = indexDataset(d);
    expect(ownerName(index, { hpe_owner_email: 'p.A@example.com' })).toBe('Sample Person A');
    expect(ownerName(index, { hpe_owner_email: null, owner_name: 'Sample Person Z' })).toBe('Sample Person Z');
    expect(dealLabel(index, deal(1, 'co-1', 'Develop', { name: '' }))).toBe('Sample Co 1 deal');
  });

  it('formats dollars', () => {
    expect(money(1250000)).toBe('$1,250,000');
    expect(money(null)).toBe('');
    expect(moneyShort(1250000)).toBe('$1.3M');
    expect(moneyShort(450000)).toBe('$450K');
    expect(moneyShort(900)).toBe('$900');
  });
});

describe('search', () => {
  const d = dataset({
    people: [person('A', ['eam'])],
    companies: [company(1), company(2), company(10), partner(1, ['US-WA']), company(3, 'US-WA', { name: 'Société Générale Sample' })],
    contacts: [contact('co-1-x', 'co-1', 'Sample Contact Jo')],
    deals: [deal(77, 'co-2', 'Develop', { name: 'VME migration' })],
  });

  it('finds companies, contacts, people, and deals', () => {
    expect(search(d, 'sample person a')[0]).toMatchObject({ kind: 'person', id: 'p.A@example.com' });
    expect(search(d, 'contact jo')[0]).toMatchObject({ kind: 'contact', id: 'co-1-x' });
    expect(search(d, 'vme mig')[0]).toMatchObject({ kind: 'deal', id: 'OPE-0000000077' });
    expect(search(d, 'OPE-0000000077')[0]).toMatchObject({ kind: 'deal' });
    expect(search(d, 'sample partner')[0]).toMatchObject({ kind: 'company', id: 'partner-1' });
  });

  it('ranks prefix matches first, sorts numbers naturally, and ignores accents', () => {
    expect(
      search(d, 'sample co')
        .map((h) => h.label)
        .slice(0, 3),
    ).toEqual(['Sample Co 1', 'Sample Co 2', 'Sample Co 10']);
    expect(search(d, 'societe')[0]!.label).toBe('Société Générale Sample');
  });
});

describe('org tree', () => {
  it('builds from reports_to and keeps orphans and loops at the top', () => {
    const tree = orgTree([
      contact('a', 'co-1', 'A'),
      contact('b', 'co-1', 'B', 'a'),
      contact('c', 'co-1', 'C', 'missing'),
      contact('d', 'co-1', 'D', 'e'),
      contact('e', 'co-1', 'E', 'd'),
    ]);
    expect(tree.map((n) => n.item.id)).toEqual(['a', 'c', 'd', 'e']);
    expect(tree[0]!.children.map((n) => n.item.id)).toEqual(['b']);
  });
});
