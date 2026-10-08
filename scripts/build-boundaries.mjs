// Builds public/geo/north-america.topo.json from Natural Earth (public domain).
//
// Downloads two 10m files once into .cache/ (gitignored), keeps US and Canadian
// states and provinces as `regions` and nearby countries as `countries`,
// simplifies both, and writes one TopoJSON file. Fails if any member code in
// config/territories.json has no matching shape.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache');
const out = join(root, 'public', 'geo', 'north-america.topo.json');
const base = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const files = {
  admin1: 'ne_10m_admin_1_states_provinces_lakes.geojson',
  admin0: 'ne_10m_admin_0_countries_lakes.geojson',
};

// Share of points kept by Visvalingam simplification. Tuned for a laptop map
// that zooms to single states; docs/progress.md records the resulting size.
const SIMPLIFY = process.env.SIMPLIFY ?? '15%';

mkdirSync(cache, { recursive: true });
mkdirSync(dirname(out), { recursive: true });

for (const name of Object.values(files)) {
  const path = join(cache, name);
  if (existsSync(path) && statSync(path).size > 0) continue;
  console.log(`Downloading ${name}`);
  const res = await fetch(base + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} from ${base}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

const mapshaper = join(root, 'node_modules', '.bin', 'mapshaper');
const args = [
  // US and Canadian states, provinces, and territories.
  '-i', join(cache, files.admin1), 'name=regions',
  '-filter', "iso_a2 == 'US' || iso_a2 == 'CA'",
  '-each', 'code = iso_3166_2, country = iso_a2',
  '-filter-fields', 'code,name,country',
  '-simplify', SIMPLIFY, 'weighted', 'keep-shapes',

  // Every other country in view, drawn gray.
  '-i', join(cache, files.admin0), 'name=countries',
  '-filter', "ADM0_A3 != 'USA' && ADM0_A3 != 'CAN'",
  '-clip', 'bbox=-180,5,-10,84',
  '-each', 'iso = ADM0_A3, name = NAME',
  '-filter-fields', 'iso,name',
  '-simplify', SIMPLIFY, 'weighted', 'keep-shapes',

  // Russia's far east sits across the antimeridian from Alaska.
  '-i', join(cache, files.admin0), 'name=russia_east',
  '-filter', "ADM0_A3 == 'RUS'",
  '-clip', 'bbox=150,45,180,80',
  '-each', 'iso = ADM0_A3, name = NAME',
  '-filter-fields', 'iso,name',
  '-simplify', SIMPLIFY, 'weighted', 'keep-shapes',

  '-merge-layers', 'target=countries,russia_east', 'name=countries', 'force',
  '-o', out, 'format=topojson', 'quantization=100000', 'target=regions,countries', 'combine-layers',
];
execFileSync(mapshaper, args, { stdio: 'inherit' });

// Every config member must have a shape.
const topo = JSON.parse(readFileSync(out, 'utf8'));
const codes = new Set(topo.objects.regions.geometries.map((g) => g.properties.code));
const config = JSON.parse(readFileSync(join(root, 'config', 'territories.json'), 'utf8'));
const missing = config.territories.flatMap((t) => t.members.map((m) => m.code)).filter((c) => !codes.has(c));
if (missing.length) {
  console.error(`No shape for config codes: ${missing.join(', ')}`);
  process.exit(1);
}
const kb = (statSync(out).size / 1024).toFixed(0);
console.log(`Wrote ${out}: ${codes.size} regions, ${topo.objects.countries.geometries.length} countries, ${kb} KB`);
