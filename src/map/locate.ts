// Finds a company's HQ city among the towns bundled for the map, so a company
// with a city and a state but no coordinates pins at its city instead of at
// its state's center. The pin still reads "location unverified": the town's
// center is a fair guess at an HQ, not a checked address.

import { geoBounds, geoContains } from 'd3-geo';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { fold } from '../data/names';
import type { CityProps } from './detail';
import type { RegionFeature } from './geo';

export type CityLocator = (city: string, state: string) => [number, number] | null;

/** The form two spellings of a town share: "St. George" and "Saint George", "Fort Worth" and "Ft Worth". */
export function cityKey(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^st /, 'saint ')
    .replace(/^ste /, 'sainte ')
    .replace(/^ft /, 'fort ')
    .replace(/^mt /, 'mount ');
}

/**
 * A lookup from (city, region code) to the town's [lng, lat]. A town counts
 * as in the region when the region's outline contains it, or, for a coastal
 * town the simplified outline leaves just offshore, when no region contains
 * it and it lies within the region's bounding box. When two towns in a region
 * share a name, the bigger one wins.
 */
export function makeCityLocator(cities: FeatureCollection<Point, CityProps>, regions: RegionFeature[]): CityLocator {
  const byName = new Map<string, Feature<Point, CityProps>[]>();
  for (const f of cities.features) {
    const key = cityKey(f.properties.name);
    const list = byName.get(key);
    if (list) list.push(f);
    else byName.set(key, [f]);
  }
  for (const list of byName.values()) list.sort((a, b) => b.properties.pop - a.properties.pop);
  const regionByCode = new Map(regions.map((r) => [r.properties.code, r]));
  const boundsByCode = new Map<string, [[number, number], [number, number]]>();
  const cache = new Map<string, [number, number] | null>();

  const inBounds = (code: string, [lng, lat]: [number, number]) => {
    let b = boundsByCode.get(code);
    if (!b) {
      b = geoBounds(regionByCode.get(code)!) as [[number, number], [number, number]];
      boundsByCode.set(code, b);
    }
    const pad = 0.3;
    return lng >= b[0][0] - pad && lng <= b[1][0] + pad && lat >= b[0][1] - pad && lat <= b[1][1] + pad;
  };

  return (city, state) => {
    const name = cityKey(city);
    const region = regionByCode.get(state);
    if (!name || !region) return null;
    const cacheKey = `${state} ${name}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    const candidates = byName.get(name) ?? [];
    let found: [number, number] | null = null;
    for (const f of candidates) {
      const xy = f.geometry.coordinates as [number, number];
      if (geoContains(region, xy)) {
        found = xy;
        break;
      }
    }
    if (!found) {
      for (const f of candidates) {
        const xy = f.geometry.coordinates as [number, number];
        if (inBounds(state, xy) && !regions.some((r) => geoContains(r, xy))) {
          found = xy;
          break;
        }
      }
    }
    cache.set(cacheKey, found);
    return found;
  };
}
