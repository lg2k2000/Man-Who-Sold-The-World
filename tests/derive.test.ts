import { describe, expect, it } from 'vitest';
import rawConfig from '../config/territories.json';
import { parseTerritoryConfig } from '../src/config/territories';
import {
  coverageRoles,
  filterProspects,
  hasOverlap,
  indexDataset,
  isOpenDeal,
  NO_FILTERS,
  orgTree,
  search,
  territorySummary,
} from '../src/data/derive';
import { emptyDataset, type Dataset, type Deal, type Partner, type Person, type Prospect, type Role } from '../src/data/types';

const config = parseTerritoryConfig(rawConfig);
const prov = { source: 'test', verified_at: null, updated_by: 'test' };

function person(tag: string, roles: Role[], states: string[] = ['US-WA'], territories: string[] = []): Person {
  return { email: `p.${tag}@example.com`, name: `Sample Person ${tag}`, roles, specialty: null, territories, states, notes: '', ...prov };
}

function prospect(n: number, state = 'US-WA', extra: Partial<Prospect> = {}): Prospect {
  return {
    id: `co-${n}`,
    name: `Sample Co ${n}`,
    hq_city: 'Seattle',
    state,
    lat: 47.6,
    lng: -122.3,
    industry: '',
    description: '',
    segment: 'enterprise',
    tier_fit: 'vme',
    primary_partner_id: null,
    hpe_owner_email: null,
    notes: '',
    ...prov,
    ...extra,
  };
}

function partner(n: number, states: string[], vme: Partner['has_done_vme'] = 'unknown'): Partner {
  return {
    id: `partner-${n}`,
    name: `Sample Partner ${n}`,
    states,
    has_done_vme: vme,
    has_done_morpheus_enterprise: 'unknown',
    contacts: [],
    notes: '',
    ...prov,
  };
}

function deal(n: number, prospectId: string, stage: string): Deal {
  return {
    op_id: `OPE-${String(n).padStart(10, '0')}`,
    prospect_id: prospectId,
    stage,
    close_date: null,
    hpe_owner_email: null,
    partner_id: null,
    as_of: '2026-10-01',
    ...prov,
  };
}

function dataset(patch: Partial<Dataset>): Dataset {
  return { ...emptyDataset(), ...patch };
}

describe('open deals', () => {
  it('treats Closed Won and Closed Lost as closed and everything else as open', () => {
    expect(isOpenDeal(deal(1, 'x', 'Closed Won'))).toBe(false);
    expect(isOpenDeal(deal(1, 'x', 'closed lost'))).toBe(false);
    expect(isOpenDeal(deal(1, 'x', 'Commit'))).toBe(true);
    expect(isOpenDeal(deal(1, 'x', 'Qualify'))).toBe(true);
    expect(isOpenDeal(deal(1, 'x', 'Disclosed'))).toBe(true);
  });
});

describe('overlap rule', () => {
  it('needs three distinct account coverage roles', () => {
    expect(coverageRoles([person('A', ['storage']), person('B', ['compute']), person('C', ['zerto'])])).toHaveLength(3);
  });

  it('does not count the EAM', () => {
    const roles = coverageRoles([person('A', ['eam']), person('B', ['storage']), person('C', ['compute'])]);
    expect(roles).toEqual(['storage', 'compute']);
  });

  it('counts a role once however many people hold it', () => {
    const roles = coverageRoles([person('A', ['other']), person('B', ['other']), person('C', ['storage'])]);
    expect(roles).toEqual(['storage', 'other']);
  });

  it('ignores territory team roles', () => {
    const roles = coverageRoles([person('A', ['morpheus']), person('B', ['opsramp']), person('C', ['storage'])]);
    expect(roles).toEqual(['storage']);
  });

  it('counts every account role a multi-role person holds', () => {
    const roles = coverageRoles([person('A', ['sled', 'other']), person('B', ['greenlake'])]);
    expect(roles).toEqual(['greenlake', 'sled', 'other']);
  });

  it('flags prospects through the coverage table', () => {
    const people = [person('A', ['eam']), person('B', ['storage']), person('C', ['compute']), person('D', ['networking'])];
    const d = dataset({
      people,
      prospects: [prospect(1), prospect(2)],
      coverage: [
        ...people.map((p) => ({ person_email: p.email, prospect_id: 'co-1', ...prov })),
        ...people.slice(0, 3).map((p) => ({ person_email: p.email, prospect_id: 'co-2', ...prov })),
      ],
    });
    const index = indexDataset(d);
    expect(hasOverlap(index, 'co-1')).toBe(true);
    expect(hasOverlap(index, 'co-2')).toBe(false);
  });

  it('ignores coverage rows that point at missing people or prospects', () => {
    const d = dataset({
      people: [person('A', ['storage'])],
      prospects: [prospect(1)],
      coverage: [
        { person_email: 'p.A@example.com', prospect_id: 'co-1', ...prov },
        { person_email: 'nobody@example.com', prospect_id: 'co-1', ...prov },
        { person_email: 'p.A@example.com', prospect_id: 'co-404', ...prov },
      ],
    });
    expect(indexDataset(d).coverageByProspect.get('co-1')).toHaveLength(1);
  });
});

describe('filters', () => {
  const people = [person('A', ['storage']), person('B', ['compute']), person('C', ['zerto'])];
  const d = dataset({
    people,
    partners: [partner(1, ['US-WA'])],
    prospects: [
      prospect(1, 'US-WA', { tier_fit: 'vme', primary_partner_id: 'partner-1' }),
      prospect(2, 'US-OR', { tier_fit: 'advanced' }),
      prospect(3, 'US-CA', { tier_fit: 'vme' }),
      prospect(4, 'US-HI', { tier_fit: 'unknown' }),
    ],
    coverage: people.map((p) => ({ person_email: p.email, prospect_id: 'co-2', ...prov })),
    deals: [deal(1, 'co-1', 'Commit'), deal(2, 'co-3', 'Closed Won')],
  });
  const index = indexDataset(d);
  const ids = (f: Partial<typeof NO_FILTERS>) => filterProspects(d, index, config, { ...NO_FILTERS, ...f }).map((p) => p.id);

  it('returns everything with no filters, unassigned states included', () => {
    expect(ids({})).toEqual(['co-1', 'co-2', 'co-3', 'co-4']);
  });

  it('narrows by territory', () => {
    expect(ids({ territoryId: 'pacnorthwest' })).toEqual(['co-1', 'co-2']);
    expect(ids({ territoryId: 'southwest' })).toEqual(['co-3']);
  });

  it('narrows by tier fit', () => {
    expect(ids({ tierFit: 'vme' })).toEqual(['co-1', 'co-3']);
  });

  it('narrows by primary partner', () => {
    expect(ids({ partnerId: 'partner-1' })).toEqual(['co-1']);
  });

  it('narrows by open deal, counting a closed deal as none', () => {
    expect(ids({ openDeal: 'yes' })).toEqual(['co-1']);
    expect(ids({ openDeal: 'no' })).toEqual(['co-2', 'co-3', 'co-4']);
  });

  it('narrows to the overlap accounts', () => {
    expect(ids({ overlapOnly: true })).toEqual(['co-2']);
  });

  it('combines filters', () => {
    expect(ids({ territoryId: 'pacnorthwest', tierFit: 'vme', openDeal: 'yes' })).toEqual(['co-1']);
    expect(ids({ territoryId: 'pacnorthwest', tierFit: 'enterprise' })).toEqual([]);
  });
});

describe('territory card summary', () => {
  const d = dataset({
    people: [
      person('A', ['morpheus'], ['US-WA'], ['pacnorthwest']),
      person('B', ['opsramp'], ['US-WA'], ['pacnorthwest']),
      person('C', ['storage'], ['US-OR']),
      person('D', ['storage'], ['US-CA']),
      person('E', ['eam'], ['US-AK']),
    ],
    partners: [partner(1, ['US-WA'], 'no'), partner(2, ['US-OR'], 'yes'), partner(3, ['US-ID'], 'unknown'), partner(4, ['US-CA'], 'yes')],
    prospects: [
      prospect(1, 'US-WA', { primary_partner_id: 'partner-1' }),
      prospect(2, 'US-WA', { primary_partner_id: 'partner-1' }),
      prospect(3, 'US-OR'),
      prospect(4, 'US-CA'),
    ],
    deals: [deal(1, 'co-1', 'Develop'), deal(2, 'co-2', 'Closed Lost'), deal(3, 'co-4', 'Commit')],
  });
  const s = territorySummary(d, config, 'pacnorthwest');

  it('lists the territory team', () => {
    expect(s.morpheus.map((p) => p.name)).toEqual(['Sample Person A']);
    expect(s.opsramp.map((p) => p.name)).toEqual(['Sample Person B']);
  });

  it('groups other coverage by role, only for states in the territory', () => {
    expect(s.otherCoverage.map((g) => [g.role, g.people.map((p) => p.name)])).toEqual([
      ['eam', ['Sample Person E']],
      ['storage', ['Sample Person C']],
    ]);
  });

  it('ranks partners by primary-partner count, then VME experience', () => {
    expect(s.topPartners.map((p) => p.partner.id)).toEqual(['partner-1', 'partner-2', 'partner-3']);
  });

  it('counts prospects and open deals in the territory only', () => {
    expect(s.prospects).toBe(3);
    expect(s.openDeals).toBe(1);
  });
});

describe('search', () => {
  const d = dataset({
    people: [person('A', ['storage']), person('Smith', ['eam'])],
    partners: [partner(1, ['US-WA'])],
    prospects: [prospect(1), prospect(2), prospect(10), prospect(11, 'US-WA', { name: 'Ëxample Systems' })],
  });

  it('finds people, partners, and prospects by name', () => {
    const kinds = search(d, 'sample').map((h) => h.kind);
    expect(new Set(kinds)).toEqual(new Set(['prospect', 'person', 'partner']));
  });

  it('ranks prefix matches first and sorts numbers naturally', () => {
    expect(search(d, 'sample co').map((h) => h.label)).toEqual(['Sample Co 1', 'Sample Co 2', 'Sample Co 10']);
  });

  it('matches the start of any word', () => {
    expect(search(d, 'smith').map((h) => h.label)).toEqual(['Sample Person Smith']);
  });

  it('ignores case and accents', () => {
    expect(search(d, 'EXAMPLE').map((h) => h.label)).toEqual(['Ëxample Systems']);
  });

  it('returns nothing for an empty query', () => {
    expect(search(d, '   ')).toEqual([]);
  });
});

describe('stakeholder org tree', () => {
  const s = (id: string, reports_to: string | null) => ({ id, reports_to, name: id });

  it('nests people under their manager', () => {
    const tree = orgTree([s('cio', null), s('vp', 'cio'), s('dir', 'vp'), s('arch', 'cio')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.item.id).toBe('cio');
    expect(tree[0]!.children.map((c) => c.item.id)).toEqual(['arch', 'vp']);
    expect(tree[0]!.children[1]!.children.map((c) => c.item.id)).toEqual(['dir']);
  });

  it('makes a root of anyone whose manager is missing', () => {
    const tree = orgTree([s('a', 'ghost'), s('b', null)]);
    expect(tree.map((n) => n.item.id)).toEqual(['a', 'b']);
  });

  it('breaks a reporting loop without losing anyone', () => {
    const tree = orgTree([s('a', 'b'), s('b', 'a'), s('c', 'a')]);
    const all: string[] = [];
    const walk = (nodes: typeof tree) => nodes.forEach((n) => (all.push(n.item.id), walk(n.children)));
    walk(tree);
    expect(all.sort()).toEqual(['a', 'b', 'c']);
  });
});
