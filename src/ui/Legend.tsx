import { useState } from 'react';
import type { TerritoryConfig } from '../config/territories';
import { teamFor, teamLine } from '../data/teams';
import type { Person } from '../data/types';

interface Props {
  config: TerritoryConfig;
  people: Person[];
  focusId: string | null;
  onSelect(id: string): void;
}

export function Legend({ config, people, focusId, onSelect }: Props) {
  const [open, setOpen] = useState(true);
  return (
    <section className="legend" aria-label="Territory legend">
      <div className="legend-head">
        <h2>{config.fiscal_year} territories</h2>
        <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <ul>
          {config.territories.map((t) => {
            const team = teamLine(teamFor(t.id, people));
            const n = t.members.length;
            const off = n !== t.legend_count;
            const unconfirmed = t.members.filter((m) => !m.confirmed).length;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`legend-row${focusId === t.id ? ' active' : ''}`}
                  onClick={() => onSelect(t.id)}
                  aria-pressed={focusId === t.id}
                >
                  <span className="swatch" style={{ background: t.color }} aria-hidden="true" />
                  <span className="legend-text">
                    <span className="legend-name">
                      {t.name}
                      {unconfirmed > 0 && (
                        <span className="legend-flag">{unconfirmed === n ? 'unconfirmed' : `${unconfirmed} unconfirmed`}</span>
                      )}
                    </span>
                    <span className={`legend-team${team ? '' : ' empty'}`}>{team || 'No team imported'}</span>
                  </span>
                  <span
                    className={`legend-count${off ? ' warn' : ''}`}
                    title={off ? `The legend count is ${t.legend_count}; the config lists ${n} members.` : `${n} states and provinces`}
                  >
                    {off ? `${n} of ${t.legend_count}` : n}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
