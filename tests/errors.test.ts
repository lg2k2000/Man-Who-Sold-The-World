import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { describeStorageError } from '../src/data/idb';
import { boundariesFromTopology, loadBoundaries } from '../src/map/geo';

describe('storage errors', () => {
  it('explains a full disk, a closed database, and a blocked site', () => {
    expect(describeStorageError(new DOMException('x', 'QuotaExceededError'))).toContain('out of storage space');
    expect(describeStorageError(new DOMException('x', 'InvalidStateError'))).toContain('Reload the page');
    expect(describeStorageError(new DOMException('x', 'SecurityError'))).toContain('does not allow this site');
    expect(describeStorageError(new Error('disk on fire'))).toBe('disk on fire');
  });
});

describe('map boundaries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds regions, countries, and a coastline without Hawaii from the committed file', () => {
    const topo = JSON.parse(readFileSync(new URL('../public/geo/north-america.topo.json', import.meta.url), 'utf8'));
    const b = boundariesFromTopology(topo);
    expect(b.regions).toHaveLength(64);
    expect(b.countries.length).toBeGreaterThan(10);
    expect(b.coast.type).toBe('MultiLineString');
    // Hawaii sits near 155 to 160 degrees west and 19 to 22 north; no coastline point may land there.
    const inHawaii = b.coast.coordinates.flat().some(([lng, lat]) => lng! < -154 && lng! > -161 && lat! > 18 && lat! < 23);
    expect(inHawaii).toBe(false);
  });

  it('says the file is damaged when it is not a topology', () => {
    expect(() => boundariesFromTopology({} as never)).toThrow('damaged');
  });

  it('says what went wrong when the download fails, returns an error, or is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(loadBoundaries('/x')).rejects.toThrow('could not be downloaded');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    await expect(loadBoundaries('/x')).rejects.toThrow('HTTP 404');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{not json', { status: 200 })));
    await expect(loadBoundaries('/x')).rejects.toThrow('not valid JSON');
  });
});
