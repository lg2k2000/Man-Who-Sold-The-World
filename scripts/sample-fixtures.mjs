// Writes fixtures/sample/dataset.json: obviously fake records for UI work.
// Every row has is_sample: true. Names follow "Sample Person A" and
// "Sample Co 1"; emails use example.com, which is reserved for examples.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'config', 'territories.json'), 'utf8'));

const prov = { source: 'sample fixture', verified_at: null, updated_by: 'sample', is_sample: true };

function letters(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

let personCount = 0;
function person(roles, territories, states, extra = {}) {
  const tag = letters(personCount++);
  return {
    email: `sample.person.${tag.toLowerCase()}@example.com`,
    name: `Sample Person ${tag}`,
    roles,
    specialty: null,
    territories,
    states,
    notes: '',
    ...prov,
    ...extra,
  };
}

const people = [];
for (const t of config.territories) {
  const states = t.members.map((m) => m.code);
  people.push(person(['morpheus'], [t.id], states));
  people.push(person(['morpheus'], [t.id], states));
  people.push(person(['opsramp'], [t.id], states));
}

const dataset = {
  people,
  coverage: [],
  partners: [],
  prospects: [],
  briefs: [],
  stakeholders: [],
  deals: [],
};

const out = join(root, 'fixtures', 'sample', 'dataset.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(dataset, null, 2) + '\n');
console.log(`Wrote ${out}: ${people.length} people`);
