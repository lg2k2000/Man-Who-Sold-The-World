import { z } from 'zod';

/** ISO 3166-2 code for a US state or Canadian province or territory, such as US-WA or CA-BC. */
export const regionCodeSchema = z.string().regex(/^(US|CA)-[A-Z]{2}$/, 'expected a code like US-WA or CA-BC');

const memberSchema = z.object({
  code: regionCodeSchema,
  confirmed: z.boolean(),
});

const territorySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are lowercase letters, digits, and hyphens'),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'expected a color like #E8693A'),
  legend_count: z.number().int().nonnegative(),
  members: z.array(memberSchema),
});

export const territoryConfigSchema = z
  .object({
    fiscal_year: z.string().min(1),
    source: z.string(),
    default_focus: z.string(),
    territories: z.array(territorySchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    const ids = new Set<string>();
    const owner = new Map<string, string>();
    cfg.territories.forEach((t, ti) => {
      if (ids.has(t.id)) ctx.addIssue({ code: 'custom', path: ['territories', ti, 'id'], message: `duplicate territory id ${t.id}` });
      ids.add(t.id);
      t.members.forEach((m, mi) => {
        const prev = owner.get(m.code);
        if (prev) {
          ctx.addIssue({
            code: 'custom',
            path: ['territories', ti, 'members', mi, 'code'],
            message: `${m.code} is in both ${prev} and ${t.id}`,
          });
        }
        owner.set(m.code, t.id);
      });
    });
    if (!ids.has(cfg.default_focus)) {
      ctx.addIssue({ code: 'custom', path: ['default_focus'], message: `no territory with id ${cfg.default_focus}` });
    }
  });

export type TerritoryConfig = z.infer<typeof territoryConfigSchema>;
export type Territory = TerritoryConfig['territories'][number];
export type TerritoryMember = Territory['members'][number];

export function parseTerritoryConfig(input: unknown): TerritoryConfig {
  return territoryConfigSchema.parse(input);
}

export interface RegionAssignment {
  territory: Territory;
  confirmed: boolean;
}

/** Maps each region code to its territory. Codes in no territory are absent. */
export function buildRegionIndex(cfg: TerritoryConfig): Map<string, RegionAssignment> {
  const index = new Map<string, RegionAssignment>();
  for (const territory of cfg.territories) {
    for (const m of territory.members) index.set(m.code, { territory, confirmed: m.confirmed });
  }
  return index;
}

export interface CountCheck {
  territoryId: string;
  members: number;
  legendCount: number;
  /** members minus legend_count; negative means the territory is short. */
  difference: number;
}

/** One entry per territory whose member count differs from its legend count. */
export function countWarnings(cfg: TerritoryConfig): CountCheck[] {
  return cfg.territories
    .filter((t) => t.members.length !== t.legend_count)
    .map((t) => ({
      territoryId: t.id,
      members: t.members.length,
      legendCount: t.legend_count,
      difference: t.members.length - t.legend_count,
    }));
}

/** Region codes from `allCodes` that belong to no territory. */
export function unassignedCodes(cfg: TerritoryConfig, allCodes: Iterable<string>): string[] {
  const index = buildRegionIndex(cfg);
  return [...allCodes].filter((c) => !index.has(c)).sort();
}
