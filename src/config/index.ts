import rawConfig from '../../config/territories.json';
import { buildRegionIndex, parseTerritoryConfig } from './territories';

/** The committed territory config, validated once at startup. */
export const config = parseTerritoryConfig(rawConfig);
export const regionIndex = buildRegionIndex(config);

export function territoryIdOf(code: string): string | null {
  return regionIndex.get(code)?.territory.id ?? null;
}
