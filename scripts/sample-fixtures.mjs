// Writes fixtures/sample/dataset.json: obviously fake records for UI work.
// Every row has is_sample: true. People are "Sample Person A", companies are
// "Sample Co 1", partners are "Sample Partner 1", and every email and URL uses
// example.com, which is reserved for examples. Cities and coordinates are real
// places so pins land somewhere sensible; nothing else is.
//
// Output is deterministic: the same script always writes the same file.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'config', 'territories.json'), 'utf8'));

// Small seeded PRNG (mulberry32) so the fixtures never change between runs.
let seed = 20261007;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
const pad = (n, w) => String(n).padStart(w, '0');

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

const territoryOf = new Map();
for (const t of config.territories) for (const m of t.members) territoryOf.set(m.code, t.id);
const membersOf = Object.fromEntries(config.territories.map((t) => [t.id, t.members.map((m) => m.code)]));

// People: a three-person team per territory, then account coverage people.
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
  const states = membersOf[t.id];
  people.push(person(['morpheus'], [t.id], states));
  people.push(person(['morpheus'], [t.id], states));
  people.push(person(['opsramp'], [t.id], states));
}
const coveragePeople = [];
for (const t of config.territories) {
  const states = membersOf[t.id];
  const half = Math.ceil(states.length / 2);
  const plan = [
    [['eam'], states.slice(0, half)],
    [['eam'], states.slice(half).length ? states.slice(half) : states],
    [['storage'], states],
    [['compute'], states],
    [['networking'], states, { specialty: chance(0.5) ? 'aruba' : 'juniper' }],
    [['greenlake'], states],
    [['zerto'], states],
    [['sled', 'other'], states],
  ];
  for (const [roles, st, extra] of plan) {
    const p = person(roles, [], st, extra);
    people.push(p);
    coveragePeople.push(p);
  }
}

// Partners, each working a few neighboring territories.
const partnerPlan = [
  ['pacnorthwest'],
  ['pacnorthwest', 'southwest'],
  ['southwest', '4corners'],
  ['4corners', 'tola'],
  ['midwest', 'ohiovalley'],
  ['ohiovalley', 'nyfed'],
  ['southeast', 'tola'],
  ['northeast', 'nyfed'],
  ['pacnorthwest', 'midwest'],
  ['southeast'],
];
const yn = () => pick(['yes', 'yes', 'no', 'unknown']);
const partners = partnerPlan.map((ts, i) => ({
  id: `sample-partner-${i + 1}`,
  name: `Sample Partner ${i + 1}`,
  states: ts.flatMap((t) => membersOf[t]),
  has_done_vme: yn(),
  has_done_morpheus_enterprise: pick(['yes', 'no', 'unknown', 'unknown']),
  contacts: [0, 1].map((j) => ({
    name: `Sample Contact ${i + 1}${letters(j)}`,
    title: j === 0 ? 'Account Executive' : 'Solutions Architect',
    email: `contact.${i + 1}${letters(j).toLowerCase()}@example.com`,
  })),
  notes: '',
  ...prov,
}));

// Real cities, so pins land in the right place. Weight sets how many sample
// prospects each city gets; PacNorthwest is the heaviest, as it is the owner's.
const cities = [
  ['Seattle', 'US-WA', 47.61, -122.33, 10], ['Bellevue', 'US-WA', 47.61, -122.2, 5], ['Redmond', 'US-WA', 47.67, -122.12, 4],
  ['Tacoma', 'US-WA', 47.25, -122.44, 4], ['Spokane', 'US-WA', 47.66, -117.43, 4], ['Olympia', 'US-WA', 47.04, -122.9, 3],
  ['Portland', 'US-OR', 45.52, -122.68, 8], ['Salem', 'US-OR', 44.94, -123.03, 3], ['Eugene', 'US-OR', 44.05, -123.09, 3],
  ['Bend', 'US-OR', 44.06, -121.31, 2], ['Boise', 'US-ID', 43.62, -116.2, 5], ['Idaho Falls', 'US-ID', 43.49, -112.04, 2],
  ['Billings', 'US-MT', 45.78, -108.5, 3], ['Missoula', 'US-MT', 46.87, -113.99, 2], ['Helena', 'US-MT', 46.59, -112.04, 2],
  ['Cheyenne', 'US-WY', 41.14, -104.82, 3], ['Casper', 'US-WY', 42.87, -106.31, 2], ['Anchorage', 'US-AK', 61.22, -149.9, 5],
  ['Fairbanks', 'US-AK', 64.84, -147.72, 2], ['Juneau', 'US-AK', 58.3, -134.42, 2], ['Vancouver', 'CA-BC', 49.28, -123.12, 8],
  ['Victoria', 'CA-BC', 48.43, -123.37, 3], ['Kelowna', 'CA-BC', 49.89, -119.5, 2], ['Surrey', 'CA-BC', 49.19, -122.85, 2],
  ['Whitehorse', 'CA-YT', 60.72, -135.06, 2],
  ['Los Angeles', 'US-CA', 34.05, -118.24, 5], ['San Francisco', 'US-CA', 37.77, -122.42, 4], ['San Diego', 'US-CA', 32.72, -117.16, 3],
  ['Sacramento', 'US-CA', 38.58, -121.49, 2], ['Las Vegas', 'US-NV', 36.17, -115.14, 3], ['Reno', 'US-NV', 39.53, -119.81, 2],
  ['Phoenix', 'US-AZ', 33.45, -112.07, 4], ['Tucson', 'US-AZ', 32.22, -110.97, 2], ['Denver', 'US-CO', 39.74, -104.99, 4],
  ['Salt Lake City', 'US-UT', 40.76, -111.89, 3], ['Albuquerque', 'US-NM', 35.08, -106.65, 2], ['Dallas', 'US-TX', 32.78, -96.8, 4],
  ['Houston', 'US-TX', 29.76, -95.37, 4], ['Austin', 'US-TX', 30.27, -97.74, 3], ['Oklahoma City', 'US-OK', 35.47, -97.52, 2],
  ['New Orleans', 'US-LA', 29.95, -90.07, 2], ['Little Rock', 'US-AR', 34.75, -92.29, 2], ['Calgary', 'CA-AB', 51.05, -114.07, 3],
  ['Edmonton', 'CA-AB', 53.55, -113.49, 2], ['Regina', 'CA-SK', 50.45, -104.62, 1], ['Winnipeg', 'CA-MB', 49.9, -97.14, 2],
  ['Kansas City', 'US-MO', 39.1, -94.58, 2], ['Omaha', 'US-NE', 41.26, -95.93, 2], ['Fargo', 'US-ND', 46.88, -96.79, 1],
  ['Sioux Falls', 'US-SD', 43.55, -96.73, 1], ['Chicago', 'US-IL', 41.88, -87.63, 4], ['Minneapolis', 'US-MN', 44.98, -93.27, 3],
  ['Detroit', 'US-MI', 42.33, -83.05, 2], ['Columbus', 'US-OH', 39.96, -83.0, 2], ['Pittsburgh', 'US-PA', 40.44, -80.0, 2],
  ['Toronto', 'CA-ON', 43.65, -79.38, 4], ['Richmond', 'US-VA', 37.54, -77.44, 2], ['Baltimore', 'US-MD', 39.29, -76.61, 2],
  ['New York', 'US-NY', 40.71, -74.01, 4], ['Newark', 'US-NJ', 40.74, -74.17, 2], ['Atlanta', 'US-GA', 33.75, -84.39, 3],
  ['Miami', 'US-FL', 25.76, -80.19, 2], ['Charlotte', 'US-NC', 35.23, -80.84, 2], ['Nashville', 'US-TN', 36.16, -86.78, 2],
  ['Boston', 'US-MA', 42.36, -71.06, 3], ['Hartford', 'US-CT', 41.76, -72.67, 1], ['Montreal', 'CA-QC', 45.5, -73.57, 3],
  ['Halifax', 'CA-NS', 44.65, -63.58, 1],
];

const industries = ['Healthcare', 'Manufacturing', 'Financial services', 'Retail', 'Energy', 'Education', 'Government', 'Logistics', 'Software', 'Utilities'];
const prospects = [];
let coNumber = 1;
for (const [city, state, lat, lng, weight] of cities) {
  for (let i = 0; i < weight; i++) {
    const t = territoryOf.get(state) ?? null;
    const segment = pick(['enterprise', 'enterprise', 'mid-market', 'mid-market', 'sled']);
    const unverified = chance(0.06);
    const partnersHere = partners.filter((p) => p.states.includes(state));
    const eams = coveragePeople.filter((p) => p.roles.includes('eam') && p.states.includes(state));
    prospects.push({
      id: `sample-co-${coNumber}`,
      name: `Sample Co ${coNumber}`,
      hq_city: city,
      state,
      lat: unverified ? null : +(lat + (rand() - 0.5) * 0.25).toFixed(4),
      lng: unverified ? null : +(lng + (rand() - 0.5) * 0.35).toFixed(4),
      industry: pick(industries),
      description: `Sample ${segment} company in ${city} used for development.`,
      segment,
      tier_fit: pick(['vme', 'vme', 'advanced', 'enterprise', 'unknown']),
      primary_partner_id: partnersHere.length && chance(0.8) ? pick(partnersHere).id : null,
      hpe_owner_email: eams.length ? pick(eams).email : null,
      notes: '',
      territory_hint: t,
      ...prov,
    });
    coNumber++;
  }
}
for (const p of prospects) delete p.territory_hint;

// Coverage: each prospect gets one to five people who cover its state.
const coverage = [];
for (const pr of prospects) {
  const here = coveragePeople.filter((p) => p.states.includes(pr.state));
  const eam = here.find((p) => p.email === pr.hpe_owner_email);
  const chosen = new Set(eam ? [eam.email] : []);
  const extra = Math.floor(rand() * 5);
  for (let i = 0; i < extra; i++) chosen.add(pick(here).email);
  for (const email of chosen) coverage.push({ person_email: email, prospect_id: pr.id, ...prov });
}

// Briefs for about one prospect in five.
const sectionText = {
  what_they_do: ['Runs regional operations from a single data center.', 'Operates three plants and a shared services group.'],
  virtualization_signals: ['Job posting asks for vSphere administration experience.', 'Public RFP mentions a hypervisor refresh.', 'Conference talk described moving test workloads off VMware.'],
  filings: ['Annual report lists IT modernization as a capital priority.', 'Board minutes approved a data center budget line.'],
  recent_it_news: ['Hired a new CIO this year.', 'Announced a cloud migration program.'],
  tech_stack: ['HPE ProLiant servers and Nimble storage.', 'Mixed Dell and HPE compute, NetApp storage.'],
  broader_trends: ['Sector peers are consolidating data centers.', 'Licensing cost increases are pushing hypervisor reviews.'],
};
const briefs = [];
prospects.forEach((pr, i) => {
  if (i % 5 !== 0) return;
  const sections = {};
  for (const [key, options] of Object.entries(sectionText)) {
    const n = 1 + Math.floor(rand() * 2);
    sections[key] = Array.from({ length: n }, (_, j) => ({
      text: options[(i + j) % options.length],
      source_url: `https://example.com/sample/${pr.id}/${key}/${j + 1}`,
      source_date: `2026-${pad(1 + Math.floor(rand() * 9), 2)}-${pad(1 + Math.floor(rand() * 28), 2)}`,
      confidence: pick(['confirmed', 'reported', 'inferred']),
    }));
  }
  briefs.push({ prospect_id: pr.id, sections, ...prov });
});

// Stakeholders for the same prospects: a small org tree under a CIO.
const stakeholders = [];
const decisionRoles = ['economic buyer', 'technical decision maker', 'champion', 'influencer', 'blocker', 'unknown'];
for (const b of briefs) {
  const id = (n) => `${b.prospect_id}-s${n}`;
  const nameFor = (n) => `Sample Stakeholder ${b.prospect_id.replace('sample-co-', '')}${letters(n)}`;
  const rows = [
    [0, 'Chief Information Officer', null, 'economic buyer'],
    [1, 'VP Infrastructure', 0, 'technical decision maker'],
    [2, 'Director, Data Center', 1, pick(decisionRoles)],
    [3, 'Virtualization Manager', 2, 'champion'],
    [4, 'Security Architect', 1, pick(decisionRoles)],
  ];
  if (chance(0.5)) rows.push([5, 'Systems Engineer', 3, 'influencer']);
  for (const [n, title, parent, role] of rows) {
    stakeholders.push({
      id: id(n),
      prospect_id: b.prospect_id,
      name: nameFor(n),
      title,
      reports_to: parent === null ? null : id(parent),
      role_in_decision: role,
      last_contact: chance(0.6) ? `2026-${pad(4 + Math.floor(rand() * 6), 2)}-${pad(1 + Math.floor(rand() * 28), 2)}` : null,
      ...prov,
    });
  }
}

// Deals on about one prospect in six.
const stages = ['Qualify', 'Develop', 'Propose', 'Commit', 'Closed Won', 'Closed Lost'];
const deals = [];
let op = 1;
prospects.forEach((pr, i) => {
  if (i % 6 !== 1) return;
  const n = chance(0.25) ? 2 : 1;
  for (let j = 0; j < n; j++) {
    deals.push({
      op_id: `OPE-${pad(op++, 10)}`,
      prospect_id: pr.id,
      stage: pick(stages),
      close_date: `2027-${pad(1 + Math.floor(rand() * 10), 2)}-${pad(1 + Math.floor(rand() * 28), 2)}`,
      hpe_owner_email: pr.hpe_owner_email,
      partner_id: pr.primary_partner_id,
      as_of: '2026-10-01',
      ...prov,
    });
  }
});

const dataset = { people, coverage, partners, prospects, briefs, stakeholders, deals };
const out = join(root, 'fixtures', 'sample', 'dataset.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(dataset) + '\n');
console.log(
  `Wrote ${out}: ${people.length} people, ${partners.length} partners, ${prospects.length} prospects, ` +
    `${coverage.length} coverage links, ${briefs.length} briefs, ${stakeholders.length} stakeholders, ${deals.length} deals`,
);
