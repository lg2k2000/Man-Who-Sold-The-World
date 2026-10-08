import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import rawConfig from '../config/territories.json';
import { parseTerritoryConfig } from '../src/config/territories';
import { emptyDataset, type Dataset } from '../src/data/types';
import { guessTable, importTable, normalizeHeader } from '../src/import/importer';
import { REGION_CODES } from '../src/import/regions';
import { DOCS_END, DOCS_START, renderImportDocs } from '../src/import/docs';

const config = parseTerritoryConfig(rawConfig);

function run<T extends Parameters<typeof importTable>[0]>(table: T, text: string, current: Dataset = emptyDataset(), replace = false) {
  return importTable(table, text, `${table}.test`, current, config, { replace });
}

function reasons(r: ReturnType<typeof run>) {
  return r.report.rejected.map((i) => `${i.row} ${i.column}: ${i.reason}`);
}

/** A dataset with one person, one partner, and two prospects to point at. */
function base(): Dataset {
  const d = emptyDataset();
  d.people = run('people', 'name,email,role\nSample Person A,a@example.com,eam\n').rows!;
  d.partners = run('partners', 'id,name\nsample-partner-1,Sample Partner 1\n').rows!;
  d.prospects = run(
    'prospects',
    'id,name,state,segment\nsample-co-1,Sample Co 1,WA,enterprise\nsample-co-2,Sample Co 2,BC,sled\n',
    d,
  ).rows!;
  return d;
}

describe('headers and files', () => {
  it('normalizes headers', () => {
    expect(normalizeHeader('﻿ Person Email ')).toBe('person_email');
    expect(normalizeHeader('Has-Done-VME')).toBe('has_done_vme');
  });

  it('guesses the table from the file name', () => {
    expect(guessTable('People FY27.csv')).toBe('people');
    expect(guessTable('acme-stakeholders.json')).toBe('stakeholders');
    expect(guessTable('deals_2026-10-01.csv')).toBe('deals');
    expect(guessTable('notes.txt')).toBeNull();
  });

  it('refuses a file missing a required column and imports nothing', () => {
    const r = run('people', 'name,role\nSample Person A,eam\n');
    expect(r.rows).toBeNull();
    expect(r.report.fileErrors[0]).toContain('no email column');
  });

  it('refuses a header with no rows', () => {
    expect(run('people', 'name,email,role\n').report.fileErrors[0]).toContain('no data rows');
  });

  it('lists columns it ignored', () => {
    const r = run('people', 'name,email,role,favorite_color\nSample Person A,a@example.com,eam,blue\n');
    expect(r.report.ignoredColumns).toEqual(['favorite_color']);
    expect(r.report.added).toBe(1);
  });

  it('refuses JSON that is not JSON', () => {
    expect(run('briefs', '{oops').report.fileErrors[0]).toContain('not valid JSON');
  });
});

describe('people', () => {
  it('imports good rows with every column', () => {
    const r = run(
      'people',
      [
        'name,email,role,specialty,territories,states,notes,source,verified_at,updated_by',
        'Sample Person A,A@Example.com,Morpheus specialist,,PacNorthwest;southwest,WA;US-OR;bc,hi,deck,2026-10-01,owner',
        'Sample Person B,b@example.com,networking,Juniper,,ID,,,,',
        'Sample Person C,c@example.com,sled; other,,,,,,,',
      ].join('\n'),
    );
    expect(reasons(r)).toEqual([]);
    const [a, b, c] = r.rows!;
    expect(a).toMatchObject({
      email: 'a@example.com',
      roles: ['morpheus'],
      territories: ['pacnorthwest', 'southwest'],
      states: ['US-WA', 'US-OR', 'CA-BC'],
      source: 'deck',
      verified_at: '2026-10-01',
      updated_by: 'owner',
    });
    expect(b).toMatchObject({ roles: ['networking'], specialty: 'juniper', source: 'import: people.test', updated_by: 'import' });
    expect(c!.roles).toEqual(['sled', 'other']);
  });

  it('rejects bad rows with row numbers and reasons, and keeps the good ones', () => {
    const r = run(
      'people',
      [
        'name,email,role,territories,states,verified_at',
        'Sample Person A,a@example.com,eam,,,',
        ',not-an-email,wizard,Atlantis,ZZ,2026-02-30',
      ].join('\n'),
    );
    expect(r.rows).toHaveLength(1);
    expect(r.report.rejectedRows).toBe(1);
    const why = reasons(r).join('\n');
    expect(why).toContain('3 name: name is empty');
    expect(why).toContain('3 email: email "not-an-email" is not an email address');
    expect(why).toContain('3 role: role "wizard" is not a known role');
    expect(why).toContain('3 territories: territories "Atlantis" is not a territory');
    expect(why).toContain('3 states: states "ZZ" is not a US state or Canadian province code');
    expect(why).toContain('3 verified_at: verified_at "2026-02-30" is not a real date');
  });

  it('rejects a duplicate email in the same file', () => {
    const r = run('people', 'name,email,role\nA,a@example.com,eam\nA again,A@example.com,eam\n');
    expect(reasons(r)).toEqual(['3 email: email a@example.com already appears on row 2 of this file']);
  });

  it('updates a person by email on re-import and keeps everyone else', () => {
    const first = run('people', 'name,email,role\nA,a@example.com,eam\nB,b@example.com,storage\n');
    const d = { ...emptyDataset(), people: first.rows! };
    const second = run('people', 'name,email,role\nA renamed,a@example.com,eam\nC,c@example.com,zerto\n', d);
    expect(second.report).toMatchObject({ added: 1, updated: 1, kept: 1, removed: 0 });
    expect(second.rows!.map((p) => p.name)).toEqual(['A renamed', 'B', 'C']);
  });

  it('replaces the whole table when asked', () => {
    const d = { ...emptyDataset(), people: run('people', 'name,email,role\nA,a@example.com,eam\nB,b@example.com,eam\n').rows! };
    const r = run('people', 'name,email,role\nC,c@example.com,eam\n', d, true);
    expect(r.report).toMatchObject({ added: 1, updated: 0, removed: 2 });
    expect(r.rows!.map((p) => p.email)).toEqual(['c@example.com']);
  });
});

describe('partners', () => {
  it('reads contacts and yes/no/unknown flags', () => {
    const r = run(
      'partners',
      'id,name,states,has_done_vme,has_done_morpheus_enterprise,contacts\n' +
        'Sample-Partner-1,Sample Partner 1,WA;OR,Yes,,"Sample Contact A | Account Executive, West | a@example.com; Sample Contact B | SE |"\n',
    );
    expect(reasons(r)).toEqual([]);
    expect(r.rows![0]).toMatchObject({
      id: 'sample-partner-1',
      has_done_vme: 'yes',
      has_done_morpheus_enterprise: 'unknown',
      contacts: [
        { name: 'Sample Contact A', title: 'Account Executive, West', email: 'a@example.com' },
        { name: 'Sample Contact B', title: 'SE', email: '' },
      ],
    });
  });

  it('rejects a bad id, flag, and contact', () => {
    const r = run('partners', 'id,name,has_done_vme,contacts\nsample partner,Sample Partner,maybe,| Title | x@example.com\n');
    const why = reasons(r).join('\n');
    expect(why).toContain('id "sample partner" is not a valid id');
    expect(why).toContain('has_done_vme "maybe" is not one of yes, no, unknown');
    expect(why).toContain('has no name');
  });
});

describe('prospects', () => {
  it('imports good rows and pins rows without coordinates as unverified', () => {
    const d = base();
    const r = run(
      'prospects',
      'id,name,hq_city,state,lat,lng,segment,tier_fit,primary_partner_id,hpe_owner_email\n' +
        'sample-co-3,Sample Co 3,Seattle,WA,47.6,-122.3,enterprise,VME,sample-partner-1,a@example.com\n' +
        'sample-co-4,Sample Co 4,Boise,ID,,,Mid Market,,,\n',
      d,
    );
    expect(reasons(r)).toEqual([]);
    expect(r.report.warnings).toEqual([]);
    const added = r.rows!.slice(-2);
    expect(added[0]).toMatchObject({ lat: 47.6, lng: -122.3, tier_fit: 'vme' });
    expect(added[1]).toMatchObject({ lat: null, lng: null, segment: 'mid-market', tier_fit: 'unknown' });
  });

  it('rejects half a coordinate, a bad state, and a bad segment', () => {
    const r = run('prospects', 'id,name,state,lat,lng,segment\nsample-co-9,Sample Co 9,Cascadia,47.6,,huge\n');
    const why = reasons(r).join('\n');
    expect(why).toContain('lng: lat and lng go together');
    expect(why).toContain('state "Cascadia" is not a US state or Canadian province code');
    expect(why).toContain('segment "huge" is not one of enterprise, mid-market, sled');
  });

  it('warns, without rejecting, about a partner or owner not imported yet and coordinates off the map', () => {
    const r = run(
      'prospects',
      'id,name,state,lat,lng,segment,primary_partner_id,hpe_owner_email\nsample-co-9,Sample Co 9,WA,47.6,122.3,sled,nobody-yet,x@example.com\n',
    );
    expect(r.report.rejected).toEqual([]);
    expect(r.report.warnings.map((w) => w.column)).toEqual(['lat', 'primary_partner_id', 'hpe_owner_email']);
  });
});

describe('coverage', () => {
  it('links people to prospects that exist', () => {
    const r = run('coverage', 'person_email,prospect_id\nA@example.com,sample-co-1\n', base());
    expect(reasons(r)).toEqual([]);
    expect(r.rows).toEqual([expect.objectContaining({ person_email: 'a@example.com', prospect_id: 'sample-co-1' })]);
  });

  it('rejects links to people or prospects not imported', () => {
    const r = run('coverage', 'person_email,prospect_id\nghost@example.com,sample-co-404\n', base());
    const why = reasons(r).join('\n');
    expect(why).toContain('person_email ghost@example.com is not in People');
    expect(why).toContain('prospect_id sample-co-404 is not in Prospects');
  });

  it('treats the same person and prospect twice as a duplicate', () => {
    const r = run('coverage', 'person_email,prospect_id\na@example.com,sample-co-1\na@example.com,sample-co-1\n', base());
    expect(r.report.rejectedRows).toBe(1);
  });
});

describe('deals', () => {
  const header = 'op_id,prospect_id,stage,close_date,hpe_owner_email,partner_id,as_of\n';

  it('imports deals and matches them on op_id only', () => {
    const d = base();
    const first = run('deals', header + 'OPE-0000000001,sample-co-1,Develop,2027-03-01,a@example.com,sample-partner-1,2026-10-01\n', d);
    expect(reasons(first)).toEqual([]);
    d.deals = first.rows!;
    // Same op_id, different prospect: the op_id decides, so this updates the deal.
    const second = run('deals', header + 'ope-0000000001,sample-co-2,Commit,,,,2026-10-08\n', d);
    expect(second.report).toMatchObject({ added: 0, updated: 1 });
    expect(second.rows![0]).toMatchObject({ op_id: 'OPE-0000000001', prospect_id: 'sample-co-2', stage: 'Commit' });
  });

  it('never matches deals on company name', () => {
    const d = base();
    const r = run('deals', header + 'OPE-0000000002,Sample Co 1,Develop,,,,2026-10-01\n', d);
    expect(r.rows).toEqual([]);
    expect(reasons(r).join('\n')).toContain('prospect_id "sample co 1" is not a valid id');
  });

  it('checks the op_id format', () => {
    const d = base();
    const bad = ['OPE-123', 'OPE-00000000011', 'OP-0000000001', 'OPE-00000000A1', ''];
    const r = run('deals', header + bad.map((op) => `${op},sample-co-1,Develop,,,,2026-10-01`).join('\n') + '\n', d);
    expect(r.report.rejectedRows).toBe(5);
    expect(r.report.rejected.every((i) => i.column === 'op_id')).toBe(true);
  });

  it('rejects a duplicate op_id in one file', () => {
    const d = base();
    const r = run(
      'deals',
      header + 'OPE-0000000003,sample-co-1,Develop,,,,2026-10-01\nOPE-0000000003,sample-co-2,Develop,,,,2026-10-01\n',
      d,
    );
    expect(reasons(r)).toEqual(['3 op_id: op_id OPE-0000000003 already appears on row 2 of this file']);
  });

  it('requires a prospect that exists and an as_of date', () => {
    const d = base();
    const r = run('deals', header + 'OPE-0000000004,sample-co-404,Develop,,,,\n', d);
    const why = reasons(r).join('\n');
    expect(why).toContain('prospect_id sample-co-404 is not in Prospects');
    expect(why).toContain('as_of is empty');
  });
});

describe('briefs (JSON)', () => {
  const item = (confidence: string) => ({
    text: 'Runs a data center.',
    source_url: 'https://example.com/a',
    source_date: '2026-09-01',
    confidence,
  });

  it('imports a list and fills missing sections with empty lists', () => {
    const json = JSON.stringify([
      { prospect_id: 'sample-co-1', sections: { what_they_do: [item('confirmed')], tech_stack: [item('inferred')] } },
    ]);
    const r = run('briefs', json, base());
    expect(reasons(r)).toEqual([]);
    expect(r.rows![0]!.sections.what_they_do).toHaveLength(1);
    expect(r.rows![0]!.sections.filings).toEqual([]);
  });

  it('accepts an object holding a briefs list', () => {
    const json = JSON.stringify({ briefs: [{ prospect_id: 'sample-co-1', sections: {} }] });
    expect(run('briefs', json, base()).report.added).toBe(1);
  });

  it('rejects a brief whose item has no source, bad date, or bad confidence', () => {
    const json = JSON.stringify([
      {
        prospect_id: 'sample-co-1',
        sections: { recent_it_news: [{ text: 'x', source_url: 'not a url', source_date: '2026-09-01', confidence: 'confirmed' }] },
      },
      { prospect_id: 'sample-co-2', sections: { filings: [{ ...item('confirmed'), source_date: 'last week' }] } },
      { prospect_id: 'sample-co-1', sections: { filings: [item('rumored')] } },
    ]);
    const why = reasons(run('briefs', json, base()));
    expect(why[0]).toContain('1 sections: sections .recent_it_news[1] "not a url" is not an http or https URL');
    expect(why[1]).toContain('.filings[1] "last week" is not a date');
    expect(why[2]).toContain('"rumored" is not one of confirmed, reported, inferred');
  });

  it('warns about an unknown section and skips it', () => {
    const json = JSON.stringify([{ prospect_id: 'sample-co-1', sections: { gossip: [item('reported')] } }]);
    const r = run('briefs', json, base());
    expect(r.report.added).toBe(1);
    expect(r.report.warnings[0]!.reason).toContain('section "gossip"');
  });

  it('rejects an item that is not an object and a brief with no prospect_id', () => {
    const r = run('briefs', JSON.stringify(['nope', { sections: {} }]), base());
    expect(reasons(r)).toEqual(['1 : This item is not an object.', '2 prospect_id: prospect_id is empty; it needs a prospect id']);
  });
});

describe('stakeholders (JSON)', () => {
  it('imports a tree and flags a reports_to that points nowhere', () => {
    const json = JSON.stringify([
      { id: 'cio-1', prospect_id: 'sample-co-1', name: 'Sample Stakeholder A', title: 'CIO', role_in_decision: 'economic buyer' },
      { id: 'vp-1', prospect_id: 'sample-co-1', name: 'Sample Stakeholder B', reports_to: 'cio-1', last_contact: '2026-09-30' },
      { id: 'dir-1', prospect_id: 'sample-co-1', name: 'Sample Stakeholder C', reports_to: 'ghost' },
    ]);
    const r = run('stakeholders', json, base());
    expect(reasons(r)).toEqual([]);
    expect(r.rows!.map((s) => s.role_in_decision)).toEqual(['economic buyer', 'unknown', 'unknown']);
    expect(r.report.warnings.map((w) => w.reason)).toEqual([expect.stringContaining('reports_to ghost is not a known stakeholder')]);
  });

  it('rejects a bad decision role and a prospect that does not exist', () => {
    const json = JSON.stringify([{ id: 's-1', prospect_id: 'sample-co-404', name: 'Sample Stakeholder', role_in_decision: 'kingmaker' }]);
    const why = reasons(run('stakeholders', json, base())).join('\n');
    expect(why).toContain('"kingmaker" is not one of economic buyer');
    expect(why).toContain('prospect_id sample-co-404 is not in Prospects');
  });
});

describe('the sample fixtures', () => {
  it('pass the same validation an import would apply', async () => {
    const sample = (await import('../fixtures/sample/dataset.json')).default as unknown as Dataset;
    expect(sample.deals.every((d) => /^OPE-\d{10}$/.test(d.op_id))).toBe(true);
    expect(new Set(sample.deals.map((d) => d.op_id)).size).toBe(sample.deals.length);
    expect(sample.prospects.every((p) => REGION_CODES.all.has(p.state))).toBe(true);
  });
});

describe('region codes', () => {
  it('match the boundary file', () => {
    const topo = JSON.parse(readFileSync(new URL('../public/geo/north-america.topo.json', import.meta.url), 'utf8'));
    const codes = topo.objects.regions.geometries.map((g: { properties: { code: string } }) => g.properties.code).sort();
    expect([...REGION_CODES.all].sort()).toEqual(codes);
  });
});

describe('README', () => {
  it('lists the columns for every import file', () => {
    const path = new URL('../README.md', import.meta.url);
    const readme = readFileSync(path, 'utf8');
    const docs = renderImportDocs();
    if (process.env.UPDATE_README) {
      const start = readme.indexOf(DOCS_START);
      const end = readme.indexOf(DOCS_END);
      writeFileSync(path, readme.slice(0, start) + docs + readme.slice(end + DOCS_END.length));
      return;
    }
    expect(readme).toContain(docs);
  });
});

describe('the example import files', () => {
  const read = (name: string) => readFileSync(new URL(`../fixtures/import-examples/${name}`, import.meta.url), 'utf8');

  it('import cleanly in the documented order', () => {
    let d = emptyDataset();
    const order = [
      ['people', 'people.csv'],
      ['partners', 'partners.csv'],
      ['prospects', 'prospects.csv'],
      ['coverage', 'coverage.csv'],
      ['deals', 'deals.csv'],
      ['briefs', 'briefs.json'],
      ['stakeholders', 'stakeholders.json'],
    ] as const;
    for (const [table, file] of order) {
      const r = importTable(table, read(file), file, d, config);
      expect({ file, rejected: r.report.rejected, warnings: r.report.warnings, fileErrors: r.report.fileErrors }).toEqual({
        file,
        rejected: [],
        warnings: [],
        fileErrors: [],
      });
      d = { ...d, [table]: r.rows! };
    }
    expect(d.prospects).toHaveLength(3);
    expect(d.stakeholders.find((s) => s.id === 'sample-co-a-virt')?.reports_to).toBe('sample-co-a-infra');
  });

  it('report every problem in the broken files', () => {
    let d = emptyDataset();
    for (const [table, file] of [
      ['people', 'people.csv'],
      ['partners', 'partners.csv'],
    ] as const) {
      d = { ...d, [table]: importTable(table, read(file), file, d, config).rows! };
    }
    const p = importTable('prospects', read('broken/prospects.csv'), 'prospects.csv', d, config);
    expect(p.report).toMatchObject({ added: 2, rejectedRows: 2 });
    expect(p.report.warnings.map((w) => w.column)).toEqual(['lat', 'primary_partner_id', 'hpe_owner_email']);
    d = { ...d, prospects: p.rows! };
    const deals = importTable('deals', read('broken/deals.csv'), 'deals.csv', d, config);
    expect(deals.report).toMatchObject({ added: 1, rejectedRows: 3 });
  });
});
