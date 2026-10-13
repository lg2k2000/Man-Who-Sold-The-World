// Packs import files into a snapshot, the file a published copy of the app
// loads when it opens (see src/import/snapshot.ts). The files are imported in
// the order given, so put the HPE team first and deals after companies.
//
//   node scripts/make-snapshot.mjs --label "VME deals and the FY27 team" --out data/snapshot.json \
//     people=data/team.csv companies=data/companies.csv deals=data/deals.csv
//
// A snapshot holds real data. Write it to data/ (Git ignores it) and publish it
// only with the owner's private copy of the app; never commit it.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';

const TABLES = ['companies', 'contacts', 'deals', 'people', 'coverage', 'briefs'];
const args = process.argv.slice(2);
let label = 'Snapshot';
let out = 'data/snapshot.json';
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--label') label = args[++i];
  else if (args[i] === '--out') out = args[++i];
  else {
    const [table, path] = args[i].split('=');
    if (!TABLES.includes(table) || !path) throw new Error(`Expected table=path with a table from ${TABLES.join(', ')}, got ${args[i]}`);
    files.push({ table, name: basename(path), text: readFileSync(path, 'utf8') });
  }
}
if (!files.length) throw new Error('Give at least one table=path');
if (out.split('/').slice(0, -1).join('/') !== 'data' && !out.startsWith('/')) {
  console.warn(`Writing outside data/: make sure ${out} never reaches Git.`);
}

const made = new Date().toISOString().slice(0, 10);
const id = `${made}-${createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12)}`;
writeFileSync(out, JSON.stringify({ format: 'territory-coverage-snapshot', id, label, made, files }) + '\n');
console.log(`Wrote ${out}: ${files.map((f) => `${f.name} as ${f.table}`).join(', ')} (id ${id})`);
