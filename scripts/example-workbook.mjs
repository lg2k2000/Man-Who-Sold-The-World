// Writes fixtures/import-examples/manager-pipeline.xlsx: a fake pipeline
// report laid out the way a Salesforce export is, with a title row above the
// headers, Excel dates, a currency string, a column the app does not use, a
// second sheet, and names spelled differently from the example companies.
// Every name is fake.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeXlsx } from './lib/xlsx-writer.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day));

const header = [
  'Opportunity ID',
  'Account Name',
  'Opportunity Name',
  'Stage',
  'Amount',
  'Close Date',
  'Opportunity Owner',
  'Partner Account',
  'Forecast Category',
  'Next Step',
  'Billing State/Province',
  'Billing City',
  'Fiscal Period',
];
const rows = [
  [
    'OPE-0000000101',
    'Sample Co A',
    'VME migration',
    'Propose',
    520000,
    d(2027, 1, 30),
    'Sample Person D',
    'Sample Partner A, LLC',
    'Upside',
    'Send the pricing proposal',
    'WA',
    'Seattle',
    'Q1 FY27',
  ],
  [
    'OPE-0000000102',
    'SAMPLE CO B, INC.',
    'Cluster refresh',
    'Closed Won',
    1200000,
    d(2026, 9, 30),
    'Sample Person D',
    'Sample Partner A',
    'Won',
    '',
    'WA',
    'Spokane',
    'Q4 FY26',
  ],
  [
    'OPE-0000000301',
    'Sample Co Q',
    'Morpheus Enterprise',
    'Qualify',
    '$1.2M',
    d(2027, 4, 15),
    'Sample Person E',
    'Sample Partner C',
    'Pipeline',
    'Find the budget owner',
    'Washington',
    'Tacoma',
    'Q2 FY27',
  ],
  [
    'OPE-0000000302',
    'Sample Co R',
    'VME pilot',
    'Develop',
    95000,
    d(2027, 2, 28),
    'Sample Person Z',
    '',
    'Pipeline',
    'Run the proof of concept',
    'OR',
    'Eugene',
    'Q1 FY27',
  ],
  [
    'OPE-0000000303',
    'Sample Co R',
    'DR site',
    'Commit',
    310000,
    d(2026, 12, 19),
    'sample.d@example.com',
    'Sample Partner C',
    'Commit',
    'Get the partner quote',
    'OR',
    'Eugene',
    'Q1 FY27',
  ],
  ['', 'Sample Co S', 'Private cloud', 'Qualify', 60000, '', 'Sample Person E', '', 'Pipeline', '', 'ID', 'Boise', 'Q2 FY27'],
  [
    'OPE-0000000304',
    'Sample Co T',
    'Cluster refresh',
    'Closed Lost',
    180000,
    d(2026, 8, 31),
    'Sample Person E',
    '',
    'Lost',
    '',
    'AK',
    'Anchorage',
    'Q4 FY26',
  ],
  ['OPE-12345', 'Sample Co T', 'Bad op ID', 'Develop', 40000, d(2027, 3, 1), '', '', 'Pipeline', '', 'AK', 'Anchorage', 'Q2 FY27'],
  ['', 'Sample Co U', '', 'Qualify', 20000, '', '', '', '', '', 'MT', 'Billings', ''],
];
const bytes = writeXlsx([
  { name: 'Pipeline', rows: [['FY27 Q1 pipeline (sample data)'], [], header, ...rows] },
  { name: 'Read me', rows: [['Every name in this workbook is fake.']] },
]);
const out = join(root, 'fixtures', 'import-examples', 'manager-pipeline.xlsx');
writeFileSync(out, bytes);
console.log(`Wrote ${out}: ${rows.length} rows`);
