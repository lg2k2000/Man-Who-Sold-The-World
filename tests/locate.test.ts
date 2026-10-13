import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detailFromTopology } from '../src/map/detail';
import { boundariesFromTopology } from '../src/map/geo';
import { cityKey, makeCityLocator } from '../src/map/locate';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../public/geo/${name}`, import.meta.url), 'utf8'));
const locate = makeCityLocator(
  detailFromTopology(read('detail.topo.json')).cities,
  boundariesFromTopology(read('north-america.topo.json')).regions,
);

describe('placing a company at its HQ city', () => {
  it('finds the town in the right state when two states share the name', () => {
    const or = locate('Portland', 'US-OR')!;
    const me = locate('Portland', 'US-ME')!;
    expect(or[0]).toBeCloseTo(-122.7, 0);
    expect(me[0]).toBeCloseTo(-70.3, 0);
  });

  it('finds suburbs, coastal cities, and spellings with Saint', () => {
    expect(locate('Wilsonville', 'US-OR')).not.toBeNull();
    expect(locate('Seattle', 'US-WA')).not.toBeNull();
    expect(locate('San Francisco', 'US-CA')).not.toBeNull();
    expect(locate('St. George', 'US-UT')).toEqual(locate('Saint George', 'US-UT'));
    expect(locate('Vancouver', 'CA-BC')![0]).toBeCloseTo(-123.1, 0);
  });

  it('gives up on a town it does not have, or a town outside the state', () => {
    expect(locate('Nowhere In Particular', 'US-WA')).toBeNull();
    expect(locate('Seattle', 'US-OR')).toBeNull();
    expect(locate('', 'US-WA')).toBeNull();
  });

  it('reads common abbreviations', () => {
    expect(cityKey('Ft. Worth')).toBe('fort worth');
    expect(cityKey('Mt. Vernon')).toBe('mount vernon');
    expect(cityKey('San José')).toBe('san jose');
  });
});
