import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import rawConfig from '../config/territories.json';
import {
  buildRegionIndex,
  countWarnings,
  parseTerritoryConfig,
  territoryConfigSchema,
  unassignedCodes,
  type TerritoryConfig,
} from '../src/config/territories';

const config = parseTerritoryConfig(rawConfig);

function clone(): TerritoryConfig {
  return structuredClone(config);
}

describe('config/territories.json', () => {
  it('passes the schema', () => {
    expect(() => parseTerritoryConfig(rawConfig)).not.toThrow();
  });

  it('has the nine FY27 territories from the reference legend', () => {
    expect(config.territories.map((t) => [t.name, t.legend_count])).toEqual([
      ['Southwest', 2],
      ['PacNorthwest', 9],
      ['4 Corners', 4],
      ['TOLA', 4],
      ['Midwest', 10],
      ['Ohio Valley', 14],
      ['New York and Fed', 2],
      ['Southeast', 7],
      ['Northeast', 11],
    ]);
  });

  it('confirms only the rows the brief confirms', () => {
    const confirmedRows = config.territories.filter((t) => t.members.every((m) => m.confirmed)).map((t) => t.id);
    expect(confirmedRows).toEqual(['southwest', 'pacnorthwest', '4corners', 'tola']);
    const mixed = config.territories.filter((t) => t.members.some((m) => m.confirmed) && t.members.some((m) => !m.confirmed));
    expect(mixed).toEqual([]);
  });

  it('gives PacNorthwest the eight members the owner listed', () => {
    const pnw = config.territories.find((t) => t.id === 'pacnorthwest')!;
    expect(pnw.members.map((m) => m.code).sort()).toEqual(
      ['CA-BC', 'CA-YT', 'US-AK', 'US-ID', 'US-MT', 'US-OR', 'US-WA', 'US-WY'].sort(),
    );
  });

  it('defaults the focus to PacNorthwest', () => {
    expect(config.default_focus).toBe('pacnorthwest');
  });
});

describe('schema checks', () => {
  it('rejects a region in two territories', () => {
    const bad = clone();
    bad.territories[0]!.members.push({ code: 'US-WA', confirmed: true });
    const result = territoryConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('US-WA is in both southwest and pacnorthwest');
  });

  it('rejects a malformed code', () => {
    const bad = clone();
    bad.territories[0]!.members.push({ code: 'Washington', confirmed: true });
    expect(territoryConfigSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a default focus that names no territory', () => {
    const bad = clone();
    bad.default_focus = 'nowhere';
    expect(territoryConfigSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects duplicate territory ids', () => {
    const bad = clone();
    bad.territories[1]!.id = bad.territories[0]!.id;
    expect(territoryConfigSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a color that is not a hex color', () => {
    const bad = clone();
    bad.territories[0]!.color = 'blue';
    expect(territoryConfigSchema.safeParse(bad).success).toBe(false);
  });
});

describe('region lookup', () => {
  const index = buildRegionIndex(config);

  it('maps a region to its territory and confirmation', () => {
    expect(index.get('US-WA')?.territory.id).toBe('pacnorthwest');
    expect(index.get('US-WA')?.confirmed).toBe(true);
    expect(index.get('CA-AB')?.territory.id).toBe('midwest');
    expect(index.get('CA-AB')?.confirmed).toBe(false);
  });

  it('leaves Hawaii and DC unassigned', () => {
    expect(index.has('US-HI')).toBe(false);
    expect(index.has('US-DC')).toBe(false);
  });
});

describe('count checks', () => {
  it('flags PacNorthwest as one short and nothing else', () => {
    expect(countWarnings(config)).toEqual([{ territoryId: 'pacnorthwest', members: 8, legendCount: 9, difference: -1 }]);
  });

  it('flags a territory that has too many members', () => {
    const cfg = clone();
    cfg.territories.find((t) => t.id === 'southwest')!.members.push({ code: 'US-HI', confirmed: false });
    expect(countWarnings(cfg).find((w) => w.territoryId === 'southwest')).toEqual({
      territoryId: 'southwest',
      members: 3,
      legendCount: 2,
      difference: 1,
    });
  });
});

describe('boundary file', () => {
  const topo = JSON.parse(readFileSync(new URL('../public/geo/north-america.topo.json', import.meta.url), 'utf8'));
  const codes: string[] = topo.objects.regions.geometries.map((g: { properties: { code: string } }) => g.properties.code);

  it('holds every US state, DC, and every Canadian province and territory', () => {
    expect(codes.length).toBe(64);
    expect(new Set(codes).size).toBe(64);
  });

  it('has a shape for every config member', () => {
    const all = new Set(codes);
    const missing = config.territories.flatMap((t) => t.members.map((m) => m.code)).filter((c) => !all.has(c));
    expect(missing).toEqual([]);
  });

  it('leaves exactly DC and Hawaii out of every territory', () => {
    expect(unassignedCodes(config, codes)).toEqual(['US-DC', 'US-HI']);
  });
});
