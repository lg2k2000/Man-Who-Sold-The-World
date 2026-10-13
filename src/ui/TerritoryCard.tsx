import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RegionAssignment, TerritoryConfig } from '../config/territories';
import { moneyShort, territorySummary } from '../data/derive';
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

/**
 * The card for a territory the viewer clicked. It opens beside the click and
 * stays until it is closed, and its header drags it anywhere on the map.
 */
export function TerritoryCard({ config, index, regionNames, stage }: Props) {
  const code = useHover((s) => s.code);
  const x = useHover((s) => s.x);
  const y = useHover((s) => s.y);
  const placed = useHover((s) => s.placed);
  const move = useHover((s) => s.move);
  const clear = useHover((s) => s.clear);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const data = useApp((s) => s.data);
  const openPerson = useApp((s) => s.openPerson);
  const openCompany = useApp((s) => s.openCompany);
  const focusTerritory = useApp((s) => s.focusTerritory);
  const selectState = useApp((s) => s.selectState);
  const territory = code ? index.get(code)?.territory : undefined;
  const ref = useRef<HTMLElement>(null);
  const [cardH, setCardH] = useState(320);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight;
    if (h && h !== cardH) setCardH(h);
  });

  const summary = useMemo(() => (territory ? territorySummary(data, config, territory.id) : null), [data, config, territory]);

  if (!code) return null;
  const clampLeft = (l: number) => Math.max(8, Math.min(l, stage.w - CARD_W - 8));
  const clampTop = (t: number) => Math.max(8, Math.min(t, stage.h - Math.min(cardH, stage.h - 16) - 8));
  let left: number;
  let top: number;
  if (placed) {
    left = clampLeft(x);
    top = clampTop(y);
  } else {
    left = x + 18 + CARD_W > stage.w ? Math.max(8, x - 18 - CARD_W) : x + 18;
    // Below the click when it fits, otherwise above it, and never off the top or bottom.
    const below = y + 14;
    const above = y - 14 - cardH;
    top = Math.max(8, Math.min(below + cardH <= stage.h - 8 ? below : above, stage.h - cardH - 8));
  }
  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - left, dy: e.clientY - top };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    move(clampLeft(e.clientX - drag.current.dx), clampTop(e.clientY - drag.current.dy));
  };
  const onDragEnd = () => {
    drag.current = null;
  };
  const dragProps = { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd };
  const closeButton = (
    <button type="button" className="tcard-close" onClick={clear} aria-label="Close the territory card" title="Close">
      ×
    </button>
  );
  const name = regionNames.get(code) ?? code;
  const then = (fn: () => void) => () => {
    clear();
    fn();
  };
  const people = (list: Person[], max = 4) => {
    const shown = list.slice(0, max);
    const more = list.length - shown.length;
    return (
      <>
        {shown.map((p, i) => (
          <Fragment key={p.id}>
            {i > 0 && ', '}
            <button type="button" className="link tcard-link" onClick={then(() => openPerson(p.id))}>
              {p.name}
            </button>
          </Fragment>
        ))}
        {more > 0 && ` and ${more} more`}
      </>
    );
  };

  return (
    <aside
      className="tcard"
      ref={ref}
      style={{ left, top, width: CARD_W }}
      aria-label={territory ? `${territory.name} territory, ${name}` : name}
      onKeyDown={(e) => e.key === 'Escape' && clear()}
    >
      {!territory || !summary ? (
        <>
          <div className="tcard-head" {...dragProps}>
            <span className="swatch unassigned-swatch" />
            <strong>{name}</strong>
            {closeButton}
          </div>
          <p className="muted small">Not in any territory in the config.</p>
        </>
      ) : (
        <>
          <div className="tcard-head" {...dragProps} title="Drag to move the card">
            <span className="swatch" style={{ background: territory.color }} />
            <strong>{territory.name}</strong>
            <span className="muted small">{name}</span>
            {closeButton}
          </div>
          <dl className="tcard-stats">
            <div>
              <dt>Companies</dt>
              <dd>{summary.companies}</dd>
            </div>
            <div>
              <dt>Open deals</dt>
              <dd>{summary.openDeals}</dd>
            </div>
            <div>
              <dt>Open pipeline</dt>
              <dd>{moneyShort(summary.pipeline)}</dd>
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
                    {people(summary.morpheus)} <span className="muted">Morpheus</span>
                  </li>
                )}
                {summary.opsramp.length > 0 && (
                  <li>
                    {people(summary.opsramp)} <span className="muted">OpsRamp</span>
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
                    <span className="muted">{g.label}:</span> {people(g.people, 3)}
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
                {summary.topPartners.map(({ partner, companies }) => (
                  <li key={partner.id}>
                    <button type="button" className="link tcard-link" onClick={then(() => openCompany(partner.id))}>
                      {partner.name}
                    </button>{' '}
                    <span className="muted">
                      {companies} account{companies === 1 ? '' : 's'} · VME {partner.has_done_vme}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="tcard-actions">
            <button type="button" className="btn small" onClick={then(() => focusTerritory(territory.id))}>
              Show {territory.name}
            </button>
            <button type="button" className="btn small" onClick={then(() => selectState(code, territory.id))}>
              Zoom to {name}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
