import type { Person } from './types';

export interface TerritoryTeam {
  morpheus: Person[];
  opsramp: Person[];
}

/** People whose roles include a territory team role and whose territories include this one. */
export function teamFor(territoryId: string, people: Person[]): TerritoryTeam {
  const onTeam = people.filter((p) => p.territories.includes(territoryId));
  return {
    morpheus: onTeam.filter((p) => p.roles.includes('morpheus')).sort(byName),
    opsramp: onTeam.filter((p) => p.roles.includes('opsramp')).sort(byName),
  };
}

/** "A / B (Morpheus) + C (OpsRamp)", the reference legend's format. Empty string for no team. */
export function teamLine(team: TerritoryTeam): string {
  const parts: string[] = [];
  if (team.morpheus.length) parts.push(`${team.morpheus.map((p) => p.name).join(' / ')} (Morpheus)`);
  if (team.opsramp.length) parts.push(`${team.opsramp.map((p) => p.name).join(' / ')} (OpsRamp)`);
  return parts.join(' + ');
}

function byName(a: Person, b: Person) {
  return a.name.localeCompare(b.name);
}
