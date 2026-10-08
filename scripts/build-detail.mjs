// Builds public/geo/detail.topo.json: the map's detail layers, loaded after
// the territory map has drawn.
//
//   cities    Natural Earth populated places in the US and Canada, plus
//             GeoNames towns of 5,000 or more people (1,000 or more in Alaska
//             and the northern territories) from the all-the-cities package
//   roads     Natural Earth highways in the US and Canada, as major or minor
//   rivers    Natural Earth rivers and lake centerlines
//   lakes     Natural Earth lakes
//   urban     Natural Earth built-up areas
//   counties  US counties from the us-atlas package (US Census cartographic boundaries)
//
// Natural Earth is public domain; us-atlas is ISC-licensed and derived from
// US Census Bureau data, which is public domain; GeoNames data is CC BY 4.0.
// Downloads are cached in .cache/ (gitignored).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache');
const out = join(root, 'public', 'geo', 'detail.topo.json');
const base = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const files = {
  cities: 'ne_10m_populated_places_simple.geojson',
  roads: 'ne_10m_roads.geojson',
  rivers: 'ne_10m_rivers_lake_centerlines.geojson',
  lakes: 'ne_10m_lakes.geojson',
  urban: 'ne_10m_urban_areas.geojson',
};
const counties = join(root, 'node_modules', 'us-atlas', 'counties-10m.json');

// North America as the map frames it.
const BBOX = 'bbox=-170,14,-50,84';

mkdirSync(cache, { recursive: true });
for (const name of Object.values(files)) {
  const path = join(cache, name);
  if (existsSync(path) && statSync(path).size > 0) continue;
  console.log(`Downloading ${name}`);
  const res = await fetch(base + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} from ${base}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}
if (!existsSync(counties)) throw new Error('us-atlas is not installed; run npm install');

const src = (k) => join(cache, files[k]);

// Cities: Natural Earth's places keep their scale rank (0 most prominent to 8);
// GeoNames towns it lacks are added at ranks 9 to 11 by population, so they
// appear only as the viewer zooms in. Hawaii is left out; the main map does not draw it.
const inHawaii = ([lng, lat]) => lat < 23 && lng < -150;
const fold = (name) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const ne = JSON.parse(readFileSync(src('cities'), 'utf8'))
  .features.filter((f) => ['USA', 'CAN'].includes(f.properties.adm0_a3) && !inHawaii(f.geometry.coordinates))
  .map((f) => {
    const p = f.properties;
    const cap = p.featurecla === 'Admin-0 capital' ? 2 : p.featurecla === 'Admin-1 capital' ? 1 : 0;
    return { coords: f.geometry.coordinates, name: p.name, pop: p.pop_max, rank: p.scalerank, cap };
  });
const nearby = new Map();
const cellOf = ([lng, lat]) => `${Math.floor(lng * 4)},${Math.floor(lat * 4)}`;
for (const c of ne) {
  const key = cellOf(c.coords);
  nearby.set(key, [...(nearby.get(key) ?? []), c]);
}
const neighbors = ([lng, lat]) => {
  const out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(...(nearby.get(cellOf([lng + dx / 4, lat + dy / 4])) ?? []));
  return out;
};
const northern = (c) => c.adminCode === 'AK' || (c.country === 'CA' && ['12', '13', '14'].includes(c.adminCode));
const towns = createRequire(import.meta.url)('all-the-cities')
  .filter((c) => c.country === 'US' || c.country === 'CA')
  // PPLX is a neighborhood inside a city, not a town.
  .filter((c) => c.featureCode !== 'PPLX' && (c.population >= 5000 || (northern(c) && c.population >= 1000)))
  .filter((c) => !inHawaii(c.loc.coordinates))
  .filter((c) => {
    // Natural Earth already has it: the same name within about 15 km, or any place within about 3 km.
    const [lng, lat] = c.loc.coordinates;
    return !neighbors(c.loc.coordinates).some((n) => {
      const d = Math.hypot((n.coords[0] - lng) * Math.cos((lat * Math.PI) / 180), n.coords[1] - lat);
      return d < 0.03 || (d < 0.15 && fold(n.name) === fold(c.name));
    });
  })
  // GeoNames sometimes lists a town twice (a town and its census place); keep the larger.
  .sort((a, b) => b.population - a.population)
  .filter((c, i, all) => {
    const [lng, lat] = c.loc.coordinates;
    return !all
      .slice(0, i)
      .some(
        (o) => fold(o.name) === fold(c.name) && Math.abs(o.loc.coordinates[0] - lng) < 0.06 && Math.abs(o.loc.coordinates[1] - lat) < 0.06,
      );
  })
  .map((c) => ({
    coords: c.loc.coordinates,
    name: c.name,
    pop: c.population,
    rank: c.population >= 20000 ? 9 : c.population >= 10000 ? 10 : 11,
    cap: 0,
  }));
const merged = join(cache, 'cities-merged.geojson');
writeFileSync(
  merged,
  JSON.stringify({
    type: 'FeatureCollection',
    features: [...ne, ...towns].map(({ coords, ...properties }) => ({
      type: 'Feature',
      properties,
      geometry: { type: 'Point', coordinates: coords },
    })),
  }),
);
console.log(`Cities: ${ne.length} from Natural Earth, ${towns.length} towns from GeoNames`);
const mapshaper = join(root, 'node_modules', '.bin', 'mapshaper');
const args = [
  // Cities: name, population, rank, and capital status, merged above.
  '-i',
  merged,
  'name=cities',

  // Highways: major (interstates, freeways, beltways) and minor (other highways). Ferries are left out.
  '-i',
  src('roads'),
  'name=roads',
  '-filter',
  "(sov_a3 == 'USA' || sov_a3 == 'CAN') && type != 'Ferry Route'",
  '-each',
  "cls = (type == 'Major Highway' || type == 'Beltway' || level == 'Interstate' || expressway == 1) ? 'major' : 'minor'",
  '-filter-fields',
  'cls',
  '-simplify',
  '10%',
  'keep-shapes',

  '-i',
  src('rivers'),
  'name=rivers',
  '-clip',
  BBOX,
  '-filter-fields',
  'name,scalerank',
  '-simplify',
  '25%',
  'keep-shapes',

  '-i',
  src('lakes'),
  'name=lakes',
  '-clip',
  BBOX,
  '-filter-fields',
  'name,scalerank',
  '-simplify',
  '25%',
  'keep-shapes',

  '-i',
  src('urban'),
  'name=urban',
  '-clip',
  BBOX,
  '-filter-fields',
  '',
  '-simplify',
  '12%',
  'keep-shapes',

  // us-atlas ships counties already simplified; keep its shapes and names.
  '-i',
  counties,
  'combine-files',
  '-drop',
  'target=states,nation',
  '-rename-layers',
  'counties',
  'target=counties',
  '-filter-fields',
  'name',
  'target=counties',

  '-o',
  out,
  'format=topojson',
  'quantization=100000',
  'target=cities,roads,rivers,lakes,urban,counties',
  'combine-layers',
];
execFileSync(mapshaper, args, { stdio: 'inherit' });

const topo = JSON.parse(readFileSync(out, 'utf8'));
const layers = Object.fromEntries(Object.entries(topo.objects).map(([k, v]) => [k, v.geometries.length]));
const kb = (statSync(out).size / 1024).toFixed(0);
console.log(`Wrote ${out}: ${JSON.stringify(layers)}, ${kb} KB`);
for (const want of ['cities', 'roads', 'rivers', 'lakes', 'urban', 'counties']) {
  if (!layers[want]) {
    console.error(`Layer ${want} is empty or missing`);
    process.exit(1);
  }
}
