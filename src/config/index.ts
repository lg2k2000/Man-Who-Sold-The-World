import rawConfig from '../../config/territories.json';
import { territoryConfigSchema, type TerritoryConfig } from './territories';

const parsed = territoryConfigSchema.safeParse(rawConfig);

/** Problems with config/territories.json; the app shows them instead of a map when there are any. */
export const configProblems: string[] = parsed.success
  ? []
  : parsed.error.issues.map((i) => `${i.path.length ? i.path.join('.') : 'file'}: ${i.message}`);

/** The territory config committed in config/territories.json, validated once at startup. */
export const committedConfig: TerritoryConfig = parsed.success
  ? parsed.data
  : { fiscal_year: '', source: '', default_focus: '', territories: [] };
