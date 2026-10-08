import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { DEFAULT_LAYERS, detailFromTopology, LAYER_LABELS, readLayers } from '../src/map/detail';

const path = new URL('../public/geo/detail.topo.json', import.meta.url);
const topo = JSON.parse(readFileSync(path, 'utf8'));

describe('the committed detail file', () => {
  const detail = detailFromTopology(topo);

  it('has every layer, split the way the map draws them', () => {
    expect(detail.cities.features.length).toBeGreaterThan(5000);
    expect(detail.majorRoads.features.length).toBeGreaterThan(500);
    expect(detail.minorRoads.features.length).toBeGreaterThan(500);
    expect(detail.majorRivers.features.length).toBeGreaterThan(20);
    expect(detail.lakes.features.length).toBeGreaterThan(100);
    expect(detail.urban.features.length).toBeGreaterThan(100);
    expect(detail.countyLines.coordinates.length).toBeGreaterThan(1000);
  });

  it('keeps the cities the PNW team needs and leaves Hawaii to its inset', () => {
    const names = new Set(detail.cities.features.map((f) => f.properties.name));
    for (const name of ['Seattle', 'Spokane', 'Anchorage', 'Juneau', 'Boise', 'Vancouver', 'Whitehorse', 'Helena', 'Cheyenne', 'Kent']) {
      expect(names.has(name)).toBe(true);
    }
    expect(names.has('Honolulu')).toBe(false);
  });

  it('marks state and provincial capitals', () => {
    const capitals = detail.cities.features.filter((f) => f.properties.cap > 0).map((f) => f.properties.name);
    expect(capitals).toEqual(
      expect.arrayContaining(['Olympia', 'Salem', 'Boise', 'Helena', 'Cheyenne', 'Juneau', 'Victoria', 'Whitehorse']),
    );
  });

  it('does not list an added town twice, or again where Natural Earth has it', () => {
    const seen = new Map<string, [number, number][]>();
    // Natural Earth's own entries (ranks 0 to 8) go first; two of those can share a name, like the two Kansas Citys.
    const ordered = [...detail.cities.features].sort((a, b) => a.properties.rank - b.properties.rank);
    for (const f of ordered) {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      if (f.properties.rank <= 8) {
        seen.set(f.properties.name, [...(seen.get(f.properties.name) ?? []), [lng, lat]]);
        continue;
      }
      const near = (seen.get(f.properties.name) ?? []).some(([x, y]) => Math.abs(x - lng) < 0.05 && Math.abs(y - lat) < 0.05);
      expect({ name: f.properties.name, duplicate: near }).toEqual({ name: f.properties.name, duplicate: false });
      seen.set(f.properties.name, [...(seen.get(f.properties.name) ?? []), [lng, lat]]);
    }
  });

  it('stays small enough to load after the map on a laptop', () => {
    expect(statSync(path).size).toBeLessThan(4 * 1024 * 1024);
  });

  it('rejects a file that is not the detail topology', () => {
    expect(() => detailFromTopology({ type: 'Topology', objects: {} } as never)).toThrow(/damaged/);
  });
});

describe('readLayers', () => {
  it('turns every layer on by default', () => {
    expect(readLayers(undefined)).toEqual(DEFAULT_LAYERS);
    expect(Object.values(DEFAULT_LAYERS).every(Boolean)).toBe(true);
    expect(Object.keys(LAYER_LABELS).sort()).toEqual(Object.keys(DEFAULT_LAYERS).sort());
  });

  it('keeps saved switches and ignores anything malformed', () => {
    expect(readLayers({ highways: false, counties: 'no', extra: true })).toEqual({ ...DEFAULT_LAYERS, highways: false });
    expect(readLayers('junk')).toEqual(DEFAULT_LAYERS);
  });
});
