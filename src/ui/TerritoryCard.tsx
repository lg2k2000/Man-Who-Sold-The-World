import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RegionAssignment, TerritoryConfig } from '../config/territories';
import { territorySummary } from '../data/derive';
import type { Person } from '../data/types';
import { useApp } from '../state/app';
import { useHover } from '../state/hover';

interface Props {
  config: TerritoryConfig;
  index: Map<string, RegionAssignment>;
  regionNames: Map<string, string>;
  stage: { w: number; h: number };
}

const CARD_W = 300;

/** The card that follows the pointer over a territory. */
export function TerritoryCard({ config, index, regionNames, stage }: Props) {
  const code = useHover((s) => s.code);
  const x = useHover((s) => s.x);
  const y = useHover((s) => s.y);
  const data = useApp((s) => s.data);
  const territory = code ? index.get(code)?.territory : undefined;
  const ref = useRef<HTMLElement>(null);
  const [cardH, setCardH] = useState(320);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight;
    if (h && h !== cardH) setCardH(h);
  });

  const summary = useMemo(() => (territory ? territorySummary(data, config, territory.id) : null), [data, config, territory]);

  if (!code) return null;
  const left = x + 18 + CARD_W > stage.w ? Math.max(8, x - 18 - CARD_W) : x + 18;
  // Below the pointer in the top half of the map, above it in the bottom half.
  // Below the pointer when it fits, otherwise above it, and never off the top or bottom.
  const below = y + 14;
  const above = y - 14 - cardH;
  const top = Math.max(8, Math.min(below + cardH <= stage.h - 8 ? below : above, stage.h - cardH - 8));
  const name = regionNames.get(code) ?? code;

  return (
    <aside className="tcard" ref={ref} style={{ left, top, width: CARD_W }} aria-hidden="true">
      {!territory || !summary ? (
        <>
          <div className="tcard-head">
            <span className="swatch unassigned-swatch" />
            <strong>{name}</strong>
          </div>
          <p className="muted small">Not in any territory in the config.</p>
        </>
      ) : (
        <>
          <div className="tcard-head">
            <span className="swatch" style={{ background: territory.color }} />
            <strong>{territory.name}</strong>
            <span className="muted small">{name}</span>
          </div>
          <dl className="tcard-stats">
            <div>
              <dt>Prospects</dt>
              <dd>{summary.prospects}</dd>
            </div>
            <div>
              <dt>Open deals</dt>
              <dd>{summary.openDeals}</dd>
            </div>
            <div>
              <dt>States and provinces</dt>
              <dd>{territory.members.length}</dd>
            </div>
          </dl>
          <section>
            <h3>Territory team</h3>
            {summary.morpheus.length + summary.opsramp.length === 0 ? (
              <p className="muted small">No team imported.</p>
            ) : (
              <ul className="plain">
                {summary.morpheus.length > 0 && (
                  <li>
                    {names(summary.morpheus)} <span className="muted">Morpheus</span>
                  </li>
                )}
                {summary.opsramp.length > 0 && (
                  <li>
                    {names(summary.opsramp)} <span className="muted">OpsRamp</span>
                  </li>
                )}
              </ul>
            )}
          </section>
          <section>
            <h3>Other HPE coverage</h3>
            {summary.otherCoverage.length === 0 ? (
              <p className="muted small">No account coverage people imported for these states.</p>
            ) : (
              <ul className="plain">
                {summary.otherCoverage.map((g) => (
                  <li key={g.role}>
                    <span className="muted">{g.label}:</span> {names(g.people, 3)}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3>Top partners</h3>
            {summary.topPartners.length === 0 ? (
              <p className="muted small">No partners imported for these states.</p>
            ) : (
              <ul className="plain">
                {summary.topPartners.map(({ partner, prospects }) => (
                  <li key={partner.id}>
                    {partner.name}{' '}
                    <span className="muted">
                      {prospects} primary · VME {partner.has_done_vme}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="muted small tcard-hint">Click or press Enter to zoom to {name}.</p>
        </>
      )}
    </aside>
  );
}

function names(people: Person[], max = 4): string {
  const shown = people.slice(0, max).map((p) => p.name);
  const more = people.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ');
}
