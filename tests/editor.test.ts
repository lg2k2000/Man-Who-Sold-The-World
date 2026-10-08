import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import rawConfig from '../config/territories.json';
import { configHash, diffConfigs, moveRegion, serializeConfig, setConfirmed, setLegendCount } from '../src/config/editor';
import { buildRegionIndex, countWarnings, parseTerritoryConfig } from '../src/config/territories';

const config = parseTerritoryConfig(rawConfig);
const territoryOf = (cfg: typeof config, code: string) => buildRegionIndex(cfg).get(code);

describe('territory editor', () => {
  it('moves a region and marks it unconfirmed', () => {
    const next = moveRegion(config, 'CA-AB', 'pacnorthwest');
    expect(territoryOf(next, 'CA-AB')).toMatchObject({ territory: { id: 'pacnorthwest' }, confirmed: false });
    expect(territoryOf(config, 'CA-AB')?.territory.id).toBe('midwest');
  });

  it('fixes PacNorthwest count and leaves Midwest short', () => {
    const next = moveRegion(config, 'CA-AB', 'pacnorthwest');
    expect(countWarnings(next)).toEqual([{ territoryId: 'midwest', members: 9, legendCount: 10, difference: -1 }]);
  });

  it('assigns an unassigned region and unassigns one', () => {
    const withHawaii = moveRegion(config, 'US-HI', 'pacnorthwest', true);
    expect(territoryOf(withHawaii, 'US-HI')).toMatchObject({ territory: { id: 'pacnorthwest' }, confirmed: true });
    const withoutWa = moveRegion(config, 'US-WA', null);
    expect(territoryOf(withoutWa, 'US-WA')).toBeUndefined();
    expect(countWarnings(withoutWa).find((w) => w.territoryId === 'pacnorthwest')?.members).toBe(7);
  });

  it('does nothing when the region is already there', () => {
    expect(moveRegion(config, 'US-WA', 'pacnorthwest')).toBe(config);
  });

  it('refuses an unknown territory', () => {
    expect(() => moveRegion(config, 'US-WA', 'atlantis')).toThrow('No territory with id atlantis');
  });

  it('confirms a member', () => {
    const next = setConfirmed(config, 'US-NY', true);
    expect(territoryOf(next, 'US-NY')?.confirmed).toBe(true);
    expect(territoryOf(next, 'US-NJ')?.confirmed).toBe(false);
  });

  it('changes a legend count', () => {
    expect(countWarnings(setLegendCount(config, 'pacnorthwest', 8))).toEqual([]);
  });

  it('lists the changes in a draft', () => {
    const next = setConfirmed(moveRegion(config, 'CA-AB', 'pacnorthwest'), 'US-NY', true);
    expect(diffConfigs(config, next)).toEqual([
      { code: 'CA-AB', from: 'midwest', to: 'pacnorthwest', confirmedBefore: false, confirmedAfter: false },
      { code: 'US-NY', from: 'nyfed', to: 'nyfed', confirmedBefore: false, confirmedAfter: true },
    ]);
  });

  it('exports byte for byte the way the committed file is written', () => {
    const committed = readFileSync(new URL('../config/territories.json', import.meta.url), 'utf8');
    expect(serializeConfig(config)).toBe(committed);
  });

  it('exports a config that loads again', () => {
    const next = moveRegion(config, 'US-HI', 'southwest');
    expect(parseTerritoryConfig(JSON.parse(serializeConfig(next)))).toEqual(next);
  });

  it('notices when the committed config changes', () => {
    expect(configHash(config)).toBe(configHash(parseTerritoryConfig(rawConfig)));
    expect(configHash(setConfirmed(config, 'US-NY', true))).not.toBe(configHash(config));
  });
});
