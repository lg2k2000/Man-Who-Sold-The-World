// Pure edits on a territory config, used by the territory editor. Each returns
// a new config and never changes the one passed in.

import { territoryConfigSchema, type TerritoryConfig } from './territories';

/**
 * Moves a region to a territory, or out of every territory when `to` is null.
 * A region that moves arrives unconfirmed unless `confirmed` says otherwise;
 * one that stays where it is keeps its flag.
 */
export function moveRegion(cfg: TerritoryConfig, code: string, to: string | null, confirmed = false): TerritoryConfig {
  const from = cfg.territories.find((t) => t.members.some((m) => m.code === code))?.id ?? null;
  if (from === to) return cfg;
  if (to !== null && !cfg.territories.some((t) => t.id === to)) throw new Error(`No territory with id ${to}`);
  return {
    ...cfg,
    territories: cfg.territories.map((t) => {
      if (t.id === from) return { ...t, members: t.members.filter((m) => m.code !== code) };
      if (t.id === to) return { ...t, members: [...t.members, { code, confirmed }] };
      return t;
    }),
  };
}

export function setConfirmed(cfg: TerritoryConfig, code: string, confirmed: boolean): TerritoryConfig {
  return {
    ...cfg,
    territories: cfg.territories.map((t) =>
      t.members.some((m) => m.code === code) ? { ...t, members: t.members.map((m) => (m.code === code ? { ...m, confirmed } : m)) } : t,
    ),
  };
}

export function setLegendCount(cfg: TerritoryConfig, territoryId: string, legendCount: number): TerritoryConfig {
  return {
    ...cfg,
    territories: cfg.territories.map((t) => (t.id === territoryId ? { ...t, legend_count: legendCount } : t)),
  };
}

export interface ConfigChange {
  code: string;
  from: string | null;
  to: string | null;
  confirmedBefore: boolean | null;
  confirmedAfter: boolean | null;
}

/** Region-level differences between two configs, for the "changes in this draft" list. */
export function diffConfigs(before: TerritoryConfig, after: TerritoryConfig): ConfigChange[] {
  const where = (cfg: TerritoryConfig) => {
    const m = new Map<string, { territory: string; confirmed: boolean }>();
    for (const t of cfg.territories) for (const x of t.members) m.set(x.code, { territory: t.id, confirmed: x.confirmed });
    return m;
  };
  const a = where(before);
  const b = where(after);
  const codes = [...new Set([...a.keys(), ...b.keys()])].sort();
  const out: ConfigChange[] = [];
  for (const code of codes) {
    const x = a.get(code);
    const y = b.get(code);
    if (x?.territory === y?.territory && x?.confirmed === y?.confirmed) continue;
    out.push({
      code,
      from: x?.territory ?? null,
      to: y?.territory ?? null,
      confirmedBefore: x?.confirmed ?? null,
      confirmedAfter: y?.confirmed ?? null,
    });
  }
  return out;
}

/**
 * The config as the file in the repository is written: two-space indent with
 * each member on one line. Validates before writing so an export always loads.
 */
export function serializeConfig(cfg: TerritoryConfig): string {
  const valid = territoryConfigSchema.parse(cfg);
  const json = JSON.stringify(valid, null, 2);
  return (
    json.replace(/\{\n\s+"code": "([A-Z]{2}-[A-Z]{2})",\n\s+"confirmed": (true|false)\n\s+\}/g, '{ "code": "$1", "confirmed": $2 }') + '\n'
  );
}

/** A short fingerprint of a config, to notice when the committed file changes under a draft. */
export function configHash(cfg: TerritoryConfig): string {
  const s = JSON.stringify(cfg);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
