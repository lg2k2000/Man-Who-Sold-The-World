import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import rawConfig from '../config/territories.json';
import { parseTerritoryConfig } from '../src/config/territories';
import { emptyDataset, type Dataset, type TableName } from '../src/data/types';
import {
  applyMapping,
  autoMap,
  guessHeaderRow,
  guessTable,
  guessTableFromHeaders,
  importSource,
  importText,
  layoutKey,
  missingRequired,
  readDelimited,
  readWorkbook,
  tabulate,
} from '../src/import/importer';
import * as f from '../src/import/fields';
import { REGION_CODES } from '../src/import/regions';
import { companyMatchKey } from '../src/data/names';
import { DOCS_END, DOCS_START, renderImportDocs } from '../src/import/docs';
import { writeXlsx } from '../scripts/lib/xlsx-writer.mjs';

const config = parseTerritoryConfig(rawConfig);
const TODAY = '2026-10-08';

function run(table: TableName, text: string, current: Dataset = emptyDataset(), replace = false) {
  return importText(table, text, `${table}.csv`, current, config, { replace, today: TODAY });
}

function reasons(r: ReturnType<typeof run>) {
  return r.report.rejected.map((i) => `${i.row} ${i.column}: ${i.reason}`);
}

function example(name: string) {
  return readFileSync(new URL(`../fixtures/import-examples/${name}`, import.meta.url), 'utf8');
}

/** The example files imported in order, as the README describes. */
function examples(): Dataset {
  let d = emptyDataset();
  for (const [table, file] of [
    ['people', 'people.csv'],
    ['companies', 'companies.csv'],
    ['contacts', 'contacts.csv'],
    ['deals', 'deals.csv'],
    ['coverage', 'coverage.csv'],
  ] as [TableName, string][]) {
    const r = importText(table, example(file), file, d, config, { today: TODAY });
    expect({ file, rejected: reasons(r) }).toEqual({ file, rejected: [] });
    d = r.data!;
  }
  const briefs = importText('briefs', example('briefs.json'), 'briefs.json', d, config);
  expect(briefs.report.rejected).toEqual([]);
  return briefs.data!;
}

describe('field parsers', () => {
  it('reads dates the ways spreadsheets write them', () => {
    expect(f.date('2026-10-15')).toBe('2026-10-15');
    expect(f.date('10/15/2026')).toBe('2026-10-15');
    expect(f.date('10/15/26')).toBe('2026-10-15');
    expect(f.date('15-Oct-2026')).toBe('2026-10-15');
    expect(f.date('Oct 15, 2026')).toBe('2026-10-15');
    expect(f.date('October 15 2026')).toBe('2026-10-15');
    expect(f.date(new Date(Date.UTC(2026, 9, 15)))).toBe('2026-10-15');
    expect(f.date('46310')).toBe('2026-10-15');
    expect(() => f.date('2026-02-30')).toThrow(/not a real date/);
    expect(() => f.date('13/45/2026')).toThrow(/not a real date/);
    expect(() => f.date('soon')).toThrow(/not a date/);
  });

  it('reads dollar amounts with symbols, commas, and K or M', () => {
    expect(f.amount('$1,250,000.00')).toBe(1250000);
    expect(f.amount('1.25M')).toBe(1250000);
    expect(f.amount('450k')).toBe(450000);
    expect(f.amount('USD 900')).toBe(900);
    expect(f.amount(1234.567)).toBe(1234.57);
    expect(f.amount('')).toBeNull();
    expect(() => f.amount('ten thousand')).toThrow(/not a dollar amount/);
    expect(() => f.amount(-5)).toThrow(/negative/);
  });

  it('reads op IDs and states', () => {
    expect(f.optionalOpId(' ope-0000000001 ')).toBe('OPE-0000000001');
    expect(f.optionalOpId('')).toBeNull();
    expect(() => f.opId('OPE-123')).toThrow(/ten digits/);
    expect(f.region('Washington')).toBe('US-WA');
    expect(f.region('british columbia')).toBe('CA-BC');
    expect(f.region('wa')).toBe('US-WA');
    expect(() => f.region('Atlantis')).toThrow(/not a US state/);
  });
});

describe('company name matching', () => {
  it('ignores case, punctuation, "The", and company endings', () => {
    expect(companyMatchKey('Acme Corp.')).toBe(companyMatchKey('ACME Corporation'));
    expect(companyMatchKey('The Acme Company')).toBe(companyMatchKey('acme'));
    expect(companyMatchKey('Smith & Sons, LLC')).toBe(companyMatchKey('Smith and Sons'));
    expect(companyMatchKey('Acme Health')).not.toBe(companyMatchKey('Acme'));
    expect(companyMatchKey('Co')).toBe('co');
  });
});

describe('reading sources', () => {
  it('reads rows pasted from Excel, tab separated', () => {
    const src = readDelimited('Opportunity ID\tAccount Name\tStage\nOPE-0000000001\tSample Co 1\tQualify\n', 'pasted rows');
    expect(src.kind).toBe('sheets');
    const r = importSource('deals', src, emptyDataset(), config, { today: TODAY });
    expect(r.report.added).toBe(1);
    expect(r.data!.companies.map((c) => c.name)).toEqual(['Sample Co 1']);
  });

  it('finds the header row under a report title', () => {
    expect(guessHeaderRow([['Q3 pipeline'], [], ['Opportunity ID', 'Account', 'Stage'], ['OPE-0000000001', 'Co', 'Develop']])).toBe(3);
    expect(
      guessHeaderRow([
        ['name', 'email'],
        ['A', 'a@example.com'],
      ]),
    ).toBe(1);
  });

  it('guesses the table from file and sheet names, then from headers', () => {
    expect(guessTable('HPE team FY27.xlsx')).toBe('people');
    expect(guessTable('Q1 Pipeline.xlsx')).toBe('deals');
    expect(guessTable('acme-stakeholders.json')).toBe('contacts');
    expect(guessTable('partners.csv')).toBe('companies');
    expect(guessTable('notes.txt')).toBeNull();
    expect(guessTableFromHeaders(['Opportunity ID', 'Account Name', 'Amount'])).toBe('deals');
    expect(guessTableFromHeaders(['Name', 'Title', 'Email', 'Company'])).toBe('contacts');
  });

  it('refuses a JSON file that is not a list', () => {
    expect(importText('briefs', '{"x": 1}', 'b.json', emptyDataset(), config).report.fileErrors[0]).toContain('must hold a list');
    expect(importText('briefs', '{', 'b.json', emptyDataset(), config).report.fileErrors[0]).toContain('not valid JSON');
  });

  it('keeps briefs to JSON', () => {
    expect(run('briefs', 'company,sections\nx,y\n').report.fileErrors[0]).toContain('only as JSON');
  });
});

describe('column matching', () => {
  const t = tabulate({
    name: 'Pipeline',
    rows: [
      ['Opportunity', 'Account Name', 'Sales Stage', 'Total Value', 'Expected Close', 'Opportunity Owner', 'Reseller', 'Fiscal Period'],
      ['OPE-0000000001', 'Sample Co 1', 'Qualify', 1000, '1/2/2027', 'Sample Person A', 'Sample Partner 1', 'Q1'],
      ['OPE-0000000002', 'Sample Co 2', 'Develop', 2000, '1/3/2027', 'Sample Person A', '', 'Q1'],
    ],
  });

  it('matches headers by alias, and op IDs by their values whatever the header says', () => {
    expect(autoMap('deals', t)).toEqual(['op_id', 'company', 'stage', 'amount', 'close_date', 'hpe_owner', 'partner', null]);
    expect(missingRequired('deals', autoMap('deals', t))).toEqual([]);
  });

  it('gives each table column to one source column only', () => {
    const dup = tabulate({
      name: 's',
      rows: [
        ['Account', 'Account Name', 'Stage'],
        ['A', 'B', 'Qualify'],
      ],
    });
    expect(autoMap('deals', dup)).toEqual(['company', null, 'stage']);
  });

  it('lists required columns nothing fills', () => {
    expect(missingRequired('deals', [null, 'company', null])).toEqual(['stage']);
  });

  it('keys saved matchings on the table and the header layout', () => {
    expect(layoutKey('deals', ['Opportunity ID', 'Account'])).toBe('deals:opportunityid|account');
    expect(layoutKey('deals', ['opportunity_id', 'ACCOUNT'])).toBe(layoutKey('deals', ['Opportunity ID', 'Account']));
  });

  it('applies a hand-made matching and reports skipped columns', () => {
    const mapping = autoMap('deals', t);
    const rows = applyMapping(t, mapping);
    expect(rows[0]).toMatchObject({ row: 2, raw: { op_id: 'OPE-0000000001', company: 'Sample Co 1', amount: 1000 } });
    const r = importSource(
      'deals',
      { kind: 'sheets', fileName: 'p.xlsx', sheets: [{ name: 'Pipeline', rows: [t.headers, ...t.rows.map((x) => x.cells)] }] },
      emptyDataset(),
      config,
      { today: TODAY },
      mapping,
    );
    expect(r.report.ignoredColumns).toEqual(['Fiscal Period']);
    expect(r.report.added).toBe(2);
  });
});

describe('deals', () => {
  it('adds the companies, partners, and contacts a deal sheet names, and keeps unknown owners as text', () => {
    const d = run('people', 'name,email,role\nSample Person A,a@example.com,eam\n').data!;
    const r = run(
      'deals',
      [
        'op_id,name,company,stage,amount,close_date,hpe_owner,partner,contacts,state,city',
        'OPE-0000000001,VME pilot,Sample Co 1,Qualify,"$250,000",1/15/2027,Sample Person A,Sample Partner 1,Sample Contact X,WA,Seattle',
        'OPE-0000000002,DR site,sample co 1 inc,Develop,1.2M,,Sample Person Z,Sample Partner 1,,,',
      ].join('\n'),
      d,
    );
    expect(reasons(r)).toEqual([]);
    const data = r.data!;
    expect(data.companies.map((c) => [c.name, c.type, c.state, c.hq_city])).toEqual([
      ['Sample Co 1', 'prospect', 'US-WA', 'Seattle'],
      ['Sample Partner 1', 'partner', null, ''],
    ]);
    expect(data.contacts.map((c) => c.name)).toEqual(['Sample Contact X']);
    const [a, b] = data.deals;
    expect(a).toMatchObject({
      id: 'OPE-0000000001',
      amount: 250000,
      close_date: '2027-01-15',
      hpe_owner_email: 'a@example.com',
      as_of: TODAY,
    });
    expect(a!.contact_ids).toEqual([data.contacts[0]!.id]);
    expect(b).toMatchObject({ company_id: a!.company_id, amount: 1200000, hpe_owner_email: null, owner_name: 'Sample Person Z' });
    expect(r.report.created.map((c) => c.name)).toEqual(['Sample Co 1 (prospect)', 'Sample Partner 1 (partner)', 'Sample Contact X']);
    expect(r.report.matches).toEqual([{ from: 'sample co 1 inc', to: 'Sample Co 1' }]);
    expect(r.report.warnings.map((w) => w.reason)).toEqual(['owner "Sample Person Z" is not in the HPE team; kept as text']);
  });

  it('updates a deal by op ID, and a deal without one by company and name', () => {
    const first = run(
      'deals',
      'op_id,name,company,stage,amount\nOPE-0000000001,Pilot,Sample Co 1,Qualify,100\n,Refresh,Sample Co 1,Qualify,200\n',
    );
    expect(first.report.added).toBe(2);
    const second = run(
      'deals',
      'op_id,name,company,stage\nOPE-0000000001,Pilot,Sample Co 1,Commit\nOPE-0000000009,Refresh,Sample Co 1,Develop\n',
      first.data!,
    );
    expect(second.report).toMatchObject({ added: 0, updated: 2 });
    const refresh = second.data!.deals.find((d) => d.name === 'Refresh')!;
    expect(refresh).toMatchObject({ op_id: 'OPE-0000000009', stage: 'Develop', amount: 200 });
    expect(second.data!.deals).toHaveLength(2);
  });

  it('never blanks a stored field with an empty cell or a missing column', () => {
    const first = run('deals', 'op_id,name,company,stage,amount,next_step\nOPE-0000000001,Pilot,Sample Co 1,Qualify,100,Call them\n');
    const second = run('deals', 'op_id,company,stage,amount\nOPE-0000000001,Sample Co 1,Commit,\n', first.data!);
    expect(second.data!.deals[0]).toMatchObject({ name: 'Pilot', stage: 'Commit', amount: 100, next_step: 'Call them', as_of: TODAY });
  });

  it('rejects bad rows with every reason, and duplicates within the file', () => {
    const r = run('deals', example('broken/deals.csv'));
    expect(reasons(r)).toEqual([
      '3 op_id: op_id "OPE-12345" is not OPE- followed by ten digits',
      '4 amount: amount "ten thousand" is not a dollar amount',
      '4 close_date: close_date "2027-31-01" is not a real date',
      '5 : op ID OPE-0000000201 already appears on row 2',
      '6 op_id: The row needs an op ID or a deal name, so a later import can find the deal again',
    ]);
    expect(r.report.added).toBe(1);
    // The rejected rows created nothing: only the accepted row's company and partner exist.
    expect(r.data!.companies.map((c) => c.name)).toEqual(['Sample Co X', 'Sample Partner A']);
  });

  it('warns when the partner named is not a partner', () => {
    const d = run('companies', 'name,type\nSample Co 9,customer\n').data!;
    const r = run('deals', 'op_id,company,stage,partner\nOPE-0000000001,Sample Co 1,Qualify,Sample Co 9\n', d);
    expect(r.report.warnings[0]!.reason).toBe('Sample Co 9 is listed as a customer, not a partner');
  });
});

describe('companies', () => {
  it('matches existing companies by name, makes ids from names, and adds named partners', () => {
    const first = run('companies', 'name,state\nSample Co 1,WA\n');
    expect(first.data!.companies[0]!.id).toBe('sample-co-1');
    const r = run(
      'companies',
      'name,type,industry,primary_partner\nSAMPLE CO 1 LLC,customer,Healthcare,Sample Partner 7\nSample Co 2,,,\n',
      first.data!,
    );
    expect(r.report).toMatchObject({ added: 1, updated: 1 });
    const co1 = r.data!.companies.find((c) => c.id === 'sample-co-1')!;
    expect(co1).toMatchObject({
      name: 'SAMPLE CO 1 LLC',
      type: 'customer',
      industry: 'Healthcare',
      state: 'US-WA',
      primary_partner_id: 'sample-partner-7',
    });
    expect(r.data!.companies.find((c) => c.id === 'sample-partner-7')!.type).toBe('partner');
  });

  it('takes a partner row over the placeholder an earlier row made for it', () => {
    const r = run(
      'companies',
      'name,type,primary_partner,states\nSample Co 1,prospect,Sample Partner 1,\nSample Partner 1,partner,,WA;OR\n',
    );
    expect(r.data!.companies).toHaveLength(2);
    expect(r.data!.companies.find((c) => c.type === 'partner')!.states).toEqual(['US-WA', 'US-OR']);
    expect(r.report.created).toEqual([]);
  });

  it('rejects bad rows and reports every problem', () => {
    const r = run('companies', example('broken/companies.csv'));
    expect(reasons(r)).toEqual([
      '3 id: id "sample co y" is not a valid id; use lowercase letters, digits, and hyphens',
      '3 lng: lat and lng go together; give both or leave both empty',
      '3 segment: segment "huge" is not one of enterprise, mid-market, sled',
      '3 tier_fit: tier_fit "platinum" is not one of vme, advanced, enterprise, unknown',
      '4 type: type "vendor" is not one of prospect, customer, partner, other',
      '5 : company Sample Co X already appears on row 2',
    ]);
    expect(r.report.warnings.map((w) => w.reason)).toEqual(['sample.d@example.com is not in the HPE team yet']);
  });
});

describe('contacts', () => {
  it('builds the org chart from names at the same company', () => {
    const d = examples();
    const cio = d.contacts.find((c) => c.title === 'Chief Information Officer')!;
    const infra = d.contacts.find((c) => c.name === 'Sample Stakeholder B')!;
    expect(infra.reports_to).toBe(cio.id);
    expect(d.contacts.find((c) => c.name === 'Sample Stakeholder C')!).toMatchObject({
      reports_to: 'sample-co-a-infra',
      last_contact: '2026-09-15',
    });
  });

  it('matches a contact again by email or name instead of adding a second one', () => {
    const first = run('contacts', 'name,company,email\nSample Contact A,Sample Co 1,a@example.com\n');
    const again = run('contacts', 'name,company,email,title\nSample Contact A.,Sample Co 1,A@example.com,CIO\n', first.data!);
    expect(again.report).toMatchObject({ added: 0, updated: 1 });
    expect(again.data!.contacts).toHaveLength(1);
  });

  it('warns about a manager who is missing or at another company', () => {
    const r = run('contacts', 'name,company,reports_to\nSample A,Sample Co 1,nobody-here\n');
    expect(r.report.warnings[0]!.reason).toContain('is not a known contact');
  });
});

describe('people and coverage', () => {
  it('needs companies and people that exist', () => {
    const d = run('people', 'name,email,role\nSample Person A,a@example.com,eam\n').data!;
    const r = run('coverage', 'person_email,company\na@example.com,Sample Co 404\nb@example.com,Sample Co 404\n', d);
    expect(reasons(r)).toEqual([
      '2 company: company "Sample Co 404" is not in Companies; import companies first',
      '3 company: company "Sample Co 404" is not in Companies; import companies first',
      '3 person_email: person_email b@example.com is not in the HPE team; import the team first',
    ]);
  });
});

describe('the example files', () => {
  it('import cleanly in order', () => {
    const d = examples();
    expect(d.companies).toHaveLength(5);
    expect(d.contacts).toHaveLength(6);
    expect(d.deals.map((x) => [x.op_id, x.amount])).toEqual([
      ['OPE-0000000101', 450000],
      ['OPE-0000000102', 1200000],
      [null, 85000],
    ]);
    expect(d.coverage).toHaveLength(5);
    expect(d.briefs).toHaveLength(1);
  });

  it('include a pipeline workbook laid out like a Salesforce export', async () => {
    const bytes = readFileSync(new URL('../fixtures/import-examples/manager-pipeline.xlsx', import.meta.url));
    const src = await readWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'manager-pipeline.xlsx');
    expect(src.kind).toBe('sheets');
    const r = importSource('deals', src, examples(), config, { today: TODAY });
    expect(reasons(r)).toEqual([
      '11 op_id: op_id "OPE-12345" is not OPE- followed by ten digits',
      '12 op_id: The row needs an op ID or a deal name, so a later import can find the deal again',
    ]);
    expect(r.report).toMatchObject({ added: 5, updated: 2 });
    expect(r.report.ignoredColumns).toEqual(['Fiscal Period']);
    expect(r.report.matches.map((m) => `${m.from} -> ${m.to}`)).toEqual([
      'Sample Partner A, LLC -> Sample Partner A',
      'SAMPLE CO B, INC. -> Sample Co B',
    ]);
    const q = r.data!.companies.find((c) => c.name === 'Sample Co Q')!;
    expect(q).toMatchObject({ state: 'US-WA', hq_city: 'Tacoma', type: 'prospect' });
    const a = r.data!.deals.find((d) => d.op_id === 'OPE-0000000101')!;
    expect(a).toMatchObject({ stage: 'Propose', amount: 520000, close_date: '2027-01-30', next_step: 'Send the pricing proposal' });
  });
});

describe('Excel workbooks', () => {
  it('reads dates, numbers, every sheet, and true row numbers', async () => {
    const bytes = writeXlsx([
      {
        name: 'Deals',
        rows: [
          ['Report'],
          [],
          ['Op ID', 'Account', 'Stage', 'Close'],
          ['OPE-0000000001', 'Sample Co 1', 'Qualify', new Date(Date.UTC(2027, 0, 5))],
          [],
          ['bad', 'Sample Co 2', 'Qualify', 'later'],
        ],
      },
      { name: 'Other', rows: [['x', 'y']] },
    ]);
    const src = await readWorkbook(bytes.buffer as ArrayBuffer, 'w.xlsx');
    expect(src.kind === 'sheets' && src.sheets.map((s) => s.name)).toEqual(['Deals', 'Other']);
    const r = importSource('deals', src, emptyDataset(), config, { today: TODAY });
    expect(r.data!.deals[0]!.close_date).toBe('2027-01-05');
    expect(r.report.rejected.map((i) => i.row)).toEqual([6, 6]);
  });

  it('says plainly when a file is not a workbook', async () => {
    const src = await readWorkbook(new TextEncoder().encode('not a zip').buffer as ArrayBuffer, 'x.xlsx');
    expect(src.kind).toBe('error');
    expect(src.kind === 'error' && src.error).toContain('could not be read');
  });
});

describe('replace', () => {
  it('replaces the table and counts what it removed', () => {
    const first = run('people', 'name,email,role\nA,a@example.com,eam\nB,b@example.com,eam\n');
    const r = run('people', 'name,email,role\nA,a@example.com,storage\n', first.data!, true);
    expect(r.report).toMatchObject({ added: 0, updated: 1, removed: 1 });
    expect(r.data!.people).toHaveLength(1);
  });
});

describe('sample data', () => {
  it('uses only real region codes and fake names', async () => {
    const sample = (await import('../fixtures/sample/dataset.json')).default as unknown as Dataset;
    expect(sample.companies.filter((c) => c.state).every((c) => REGION_CODES.all.has(c.state!))).toBe(true);
    expect(sample.companies.every((c) => /^Sample (Co|Partner) \d+$/.test(c.name))).toBe(true);
    expect(sample.contacts.every((c) => c.name.startsWith('Sample ') && (!c.email || c.email.endsWith('@example.com')))).toBe(true);
    expect(sample.contacts.every((c) => !c.phone || /555-01\d\d$/.test(c.phone))).toBe(true);
    expect(sample.people.every((p) => p.name.startsWith('Sample Person '))).toBe(true);
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
  it('lists the columns for every import', () => {
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
