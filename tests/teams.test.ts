import { describe, expect, it } from 'vitest';
import { teamFor, teamLine } from '../src/data/teams';
import type { Person } from '../src/data/types';

function person(name: string, roles: Person['roles'], territories: string[]): Person {
  return {
    email: `${name.toLowerCase().replace(/ /g, '.')}@example.com`,
    name,
    roles,
    specialty: null,
    territories,
    states: [],
    notes: '',
    source: 'test',
    verified_at: null,
    updated_by: 'test',
  };
}

describe('territory teams', () => {
  const people = [
    person('Sample Person B', ['morpheus'], ['pacnorthwest']),
    person('Sample Person A', ['morpheus'], ['pacnorthwest', 'southwest']),
    person('Sample Person C', ['opsramp'], ['pacnorthwest']),
    person('Sample Person D', ['eam'], ['pacnorthwest']),
    person('Sample Person E', ['morpheus'], ['midwest']),
  ];

  it('takes team roles only and sorts by name', () => {
    const team = teamFor('pacnorthwest', people);
    expect(team.morpheus.map((p) => p.name)).toEqual(['Sample Person A', 'Sample Person B']);
    expect(team.opsramp.map((p) => p.name)).toEqual(['Sample Person C']);
  });

  it('lets one person sit on two territory teams', () => {
    expect(teamFor('southwest', people).morpheus.map((p) => p.name)).toEqual(['Sample Person A']);
  });

  it('formats the line like the reference legend', () => {
    expect(teamLine(teamFor('pacnorthwest', people))).toBe('Sample Person A / Sample Person B (Morpheus) + Sample Person C (OpsRamp)');
  });

  it('returns an empty line when nobody is imported', () => {
    expect(teamLine(teamFor('northeast', people))).toBe('');
  });
});
