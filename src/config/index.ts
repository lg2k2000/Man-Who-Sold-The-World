import rawConfig from '../../config/territories.json';
import { parseTerritoryConfig } from './territories';

/** The territory config committed in config/territories.json, validated once at startup. */
export const committedConfig = parseTerritoryConfig(rawConfig);
