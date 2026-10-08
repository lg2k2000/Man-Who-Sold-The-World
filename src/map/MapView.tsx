import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import type { RegionAssignment, TerritoryConfig } from '../config/territories';
import { HAWAII, mainProjection, type Boundaries } from './geo';
import { fitTransform, mainBounds, unionBounds, type Bounds } from './bounds';
import { useApp } from '../state/app';
import { useHover } from '../state/hover';
import { useEditTarget } from '../ui/TerritoryEditor';
import { filterProspects, hasOverlap, territoryCodes, type DataIndex } from '../data/derive';
import type { Prospect } from '../data/types';

export interface MapInsets {
  /** Space the legend covers on the left, kept clear when framing. */
  left: number;
  /** Space the side panel covers on the right, kept clear when framing. */
  right: number;
}

interface Props {
  boundaries: Boundaries;
  config: TerritoryConfig;
  index: Map<string, RegionAssignment>;
  insets: MapInsets;
}

const MAX_ZOOM = 60;
/** Past this zoom the map shows pins everywhere instead of per-state counts. */
const PIN_ZOOM = 2.5;

export function MapView({ boundaries, config, index, insets }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const patternRef = useRef<SVGPatternElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const framedOnce = useRef(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoomedIn, setZoomedIn] = useState(false);

  const focusId = useApp((s) => s.focusTerritoryId);
  const selectedState = useApp((s) => s.selectedState);
  const highlightCodes = useApp((s) => s.highlightCodes);
  const frame = useApp((s) => s.frame);
  const frameRequest = useApp((s) => s.frameRequest);
  const data = useApp((s) => s.data);
  const dataIndex = useApp((s) => s.index);
  const filters = useApp((s) => s.filters);
  const panel = useApp((s) => s.panel);
  const selectState = useApp((s) => s.selectState);
  const openProspect = useApp((s) => s.openProspect);
  const editing = useApp((s) => s.editingTerritories);
  const openEditor = useEditTarget((s) => s.open);
  const setHover = useHover((s) => s.set);
  const onRegionHover = useCallback((code: string | null, x: number, y: number) => setHover(code, x, y), [setHover]);
  const onRegionSelect = useCallback(
    (code: string, x: number, y: number) => {
      if (editing) openEditor(code, x, y);
      else selectState(code, index.get(code)?.territory.id ?? null);
    },
    [editing, openEditor, selectState, index],
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (!size) return null;
    const projection = mainProjection(size.w, size.h);
    const path = geoPath(projection);
    const regions = boundaries.regions
      .filter((f) => f.properties.code !== HAWAII)
      .map((f) => ({
        code: f.properties.code,
        name: f.properties.name,
        d: path(f) ?? '',
        bounds: mainBounds(f, path),
        center: largestPartCentroid(f, path),
      }));
    const byCode = new Map(regions.map((r) => [r.code, r]));
    const countries = boundaries.countries.map((f, i) => ({ key: `${f.properties.iso}-${i}`, d: path(f) ?? '' }));
    const coast = path(boundaries.coast) ?? '';
    return { projection, regions, byCode, countries, coast };
  }, [boundaries, size]);

  // Pan and zoom. The layer transform, the marker scale, and the hatch scale
  // update outside React so dragging stays smooth.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !size) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.8, MAX_ZOOM])
      .translateExtent([
        [-size.w * 0.5, -size.h * 0.5],
        [size.w * 1.5, size.h * 1.5],
      ])
      .on('start', () => setHover(null))
      .on('zoom', (event) => {
        const t = event.transform;
        const layer = layerRef.current;
        if (layer) {
          layer.setAttribute('transform', t.toString());
          layer.style.setProperty('--k', String(t.k));
        }
        patternRef.current?.setAttribute('patternTransform', `scale(${1 / t.k}) rotate(45)`);
        setZoomedIn(t.k >= PIN_ZOOM);
      });
    const svg = select(svgEl);
    svg.call(z).on('dblclick.zoom', null);
    zoomRef.current = z;
    return () => {
      svg.on('.zoom', null);
    };
  }, [size, setHover]);

  // Frame whatever the app asked for.
  useEffect(() => {
    const svgEl = svgRef.current;
    const z = zoomRef.current;
    if (!svgEl || !z || !size || !geo) return;
    const pad = 24;
    const box = { x0: insets.left + pad, y0: pad, x1: size.w - insets.right - pad, y1: size.h - pad };
    let target = zoomIdentity;
    const fit = (list: Bounds[], maxScale = MAX_ZOOM) => {
      if (!list.length) return;
      const { k, x, y } = fitTransform(unionBounds(list), box, maxScale);
      target = zoomIdentity.translate(x, y).scale(k);
    };
    if (frame.kind === 'territory') {
      const codes = territoryCodes(config, frame.id);
      fit(geo.regions.filter((r) => codes.has(r.code)).map((r) => r.bounds));
    } else if (frame.kind === 'codes') {
      const codes = new Set(frame.codes);
      fit(geo.regions.filter((r) => codes.has(r.code)).map((r) => r.bounds));
    } else if (frame.kind === 'point') {
      const region = geo.byCode.get(frame.code);
      if (region) fit([region.bounds]);
      if (frame.lng !== null && frame.lat !== null) {
        // Keep the state's zoom but center the prospect in the clear area.
        const p = geo.projection([frame.lng, frame.lat]);
        if (p) {
          const k = target.k;
          target = zoomIdentity.translate((box.x0 + box.x1) / 2 - k * p[0], (box.y0 + box.y1) / 2 - k * p[1]).scale(k);
        }
      }
    }
    const svg = select(svgEl);
    if (framedOnce.current) svg.transition().duration(650).call(z.transform, target);
    else svg.call(z.transform, target);
    framedOnce.current = true;
    // Insets change when the panel opens; that alone should not re-frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameRequest, geo, size, config]);

  const focusCodes = useMemo(() => (focusId ? territoryCodes(config, focusId) : null), [config, focusId]);
  const highlight = useMemo(() => new Set(highlightCodes ?? []), [highlightCodes]);

  const filtered = useMemo(() => filterProspects(data, dataIndex, config, filters), [data, dataIndex, config, filters]);

  // Pins show when a state or territory is chosen or the viewer has zoomed in;
  // otherwise each state shows a count.
  const scope: 'state' | 'territory' | 'all' | 'counts' | 'none' = editing
    ? 'none'
    : selectedState
      ? 'state'
      : focusId
        ? 'territory'
        : zoomedIn
          ? 'all'
          : 'counts';

  const pins = useMemo(() => {
    if (!geo || scope === 'counts' || scope === 'none') return [];
    const list = scope === 'state' ? filtered.filter((p) => p.state === selectedState) : filtered;
    return placePins(list, geo, dataIndex);
  }, [geo, scope, filtered, selectedState, dataIndex]);

  const counts = useMemo(() => {
    if (!geo || scope !== 'counts') return [];
    const n = new Map<string, number>();
    for (const p of filtered) n.set(p.state, (n.get(p.state) ?? 0) + 1);
    return [...n].flatMap(([code, count]) => {
      const r = geo.byCode.get(code);
      return r ? [{ code, name: r.name, count, x: r.center[0], y: r.center[1] }] : [];
    });
  }, [geo, scope, filtered]);

  // Keyboard order: territories as the legend lists them, regions by name, unassigned last.
  const regionOrder = useMemo(() => {
    if (!geo) return [];
    const rank = new Map(config.territories.map((t, i) => [t.id, i]));
    return [...geo.regions]
      .sort((a, b) => {
        const ta = rank.get(index.get(a.code)?.territory.id ?? '') ?? 99;
        const tb = rank.get(index.get(b.code)?.territory.id ?? '') ?? 99;
        return ta - tb || a.name.localeCompare(b.name);
      })
      .map((r) => r.code);
  }, [geo, config, index]);

  const regionLabels = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of filtered) n.set(p.state, (n.get(p.state) ?? 0) + 1);
    const labels = new Map<string, string>();
    for (const r of geo?.regions ?? []) {
      const a = index.get(r.code);
      const where = a ? `${a.territory.name}${a.confirmed ? '' : ', unconfirmed'}` : 'Unassigned';
      const count = n.get(r.code) ?? 0;
      labels.set(r.code, `${r.name}. ${where}. ${count} prospect${count === 1 ? '' : 's'}.`);
    }
    return labels;
  }, [geo, index, filtered]);

  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const tabRegion =
    activeRegion && regionOrder.includes(activeRegion)
      ? activeRegion
      : (regionOrder.find((c) => focusCodes?.has(c)) ?? regionOrder[0] ?? null);

  const focusRegionEl = useCallback((code: string) => {
    const el = svgRef.current?.querySelector<SVGPathElement>(`path.region[data-code="${code}"]`);
    el?.focus();
  }, []);

  const showCardFor = useCallback(
    (el: Element, code: string) => {
      const svgBox = svgRef.current?.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      if (!svgBox) return;
      setHover(code, box.left + box.width / 2 - svgBox.left, box.top + box.height / 2 - svgBox.top);
    },
    [setHover],
  );

  const onRegionKey = useCallback(
    (e: React.KeyboardEvent, code: string) => {
      const i = regionOrder.indexOf(code);
      let next: string | undefined;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = regionOrder[(i + 1) % regionOrder.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = regionOrder[(i - 1 + regionOrder.length) % regionOrder.length];
      else if (e.key === 'Home') next = regionOrder[0];
      else if (e.key === 'End') next = regionOrder.at(-1);
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const el = e.currentTarget.getBoundingClientRect();
        const svgBox = svgRef.current!.getBoundingClientRect();
        onRegionSelect(code, el.left + el.width / 2 - svgBox.left, el.top + el.height / 2 - svgBox.top);
        return;
      } else if (e.key === 'Escape') {
        setHover(null);
        return;
      } else return;
      e.preventDefault();
      if (next) {
        setActiveRegion(next);
        focusRegionEl(next);
      }
    },
    [regionOrder, focusRegionEl, onRegionSelect, setHover],
  );

  const selectedProspect = panel?.kind === 'prospect' ? panel.id : null;
  // The selected pin draws last so it sits on top.
  const orderedPins = selectedProspect
    ? [...pins.filter((p) => p.prospect.id !== selectedProspect), ...pins.filter((p) => p.prospect.id === selectedProspect)]
    : pins;

  const pinOrder = useMemo(
    () => [...pins].sort((a, b) => a.prospect.name.localeCompare(b.prospect.name, undefined, { numeric: true })).map((p) => p.prospect.id),
    [pins],
  );
  const [activePin, setActivePin] = useState<string | null>(null);
  const tabPin =
    activePin && pinOrder.includes(activePin)
      ? activePin
      : selectedProspect && pinOrder.includes(selectedProspect)
        ? selectedProspect
        : (pinOrder[0] ?? null);

  const onPinKey = (e: React.KeyboardEvent, id: string) => {
    const i = pinOrder.indexOf(id);
    let next: string | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = pinOrder[(i + 1) % pinOrder.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = pinOrder[(i - 1 + pinOrder.length) % pinOrder.length];
    else if (e.key === 'Home') next = pinOrder[0];
    else if (e.key === 'End') next = pinOrder.at(-1);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openProspect(id);
      return;
    } else return;
    e.preventDefault();
    if (next) {
      setActivePin(next);
      svgRef.current?.querySelector<SVGGElement>(`g.pin[data-id="${next}"]`)?.focus();
    }
  };

  const zoomBy = (factor: number) => {
    const svgEl = svgRef.current;
    const z = zoomRef.current;
    if (svgEl && z) select(svgEl).transition().duration(250).call(z.scaleBy, factor);
  };

  return (
    <div className="map" ref={containerRef}>
      {size && geo && (
        <svg
          ref={svgRef}
          data-editing={editing || undefined}
          width={size.w}
          height={size.h}
          className="map-svg"
          role="group"
          aria-label="Territory map. Tab to the states and provinces, then use the arrow keys; Enter zooms in."
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <pattern id="hatch" ref={patternRef} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" className="hatch-line" />
            </pattern>
          </defs>
          <rect width={size.w} height={size.h} className="map-water" />
          <g ref={layerRef} style={{ ['--k' as string]: 1 }}>
            <g className="countries">
              {geo.countries.map((c) => (
                <path key={c.key} d={c.d} />
              ))}
            </g>
            <Regions
              regions={geo.regions}
              index={index}
              focusCodes={focusCodes}
              labels={regionLabels}
              tabCode={tabRegion}
              onHover={onRegionHover}
              onSelect={onRegionSelect}
              onKey={onRegionKey}
              onFocusRegion={(el, code) => {
                setActiveRegion(code);
                showCardFor(el, code);
              }}
            />
            <path className="coast" d={geo.coast} aria-hidden="true" />
            <g className="hatches" aria-hidden="true">
              {geo.regions
                .filter((r) => index.get(r.code)?.confirmed === false)
                .map((r) => {
                  const dim = focusCodes !== null && !focusCodes.has(r.code);
                  return <path key={r.code} d={r.d} className={`hatch${dim ? ' dim' : ''}`} fill="url(#hatch)" />;
                })}
            </g>
            <g className="outlines" aria-hidden="true">
              {geo.regions
                .filter((r) => r.code === selectedState || highlight.has(r.code))
                .map((r) => (
                  <path key={r.code} d={r.d} className={r.code === selectedState ? 'outline selected' : 'outline'} />
                ))}
            </g>
            <g className="counts" aria-hidden="true">
              {counts.map((c) => (
                <g key={c.code} transform={`translate(${c.x},${c.y})`}>
                  <g className="count-badge" onClick={() => selectState(c.code, index.get(c.code)?.territory.id ?? null)}>
                    <circle r={c.count > 9 ? 12 : 10} />
                    <text dy="0.35em">{c.count}</text>
                    <title>{`${c.name}: ${c.count} prospect${c.count === 1 ? '' : 's'}`}</title>
                  </g>
                </g>
              ))}
            </g>
            <g
              className="pins"
              role="group"
              aria-label={`${pins.length} prospect pins. Use the arrow keys to move between them; Enter opens one.`}
            >
              {orderedPins.map((p) => (
                <g key={p.prospect.id} transform={`translate(${p.x},${p.y})`}>
                  <g
                    className={`pin${p.unverified ? ' unverified' : ''}${p.overlap ? ' overlap' : ''}${selectedProspect === p.prospect.id ? ' selected' : ''}`}
                    data-id={p.prospect.id}
                    role="button"
                    tabIndex={p.prospect.id === tabPin ? 0 : -1}
                    aria-label={`${p.prospect.name}, ${p.prospect.hq_city}${p.unverified ? '. Location unverified' : ''}${p.overlap ? '. Covered by 3 or more coverage roles' : ''}${dataIndex.openDealProspects.has(p.prospect.id) ? '. Open deal' : ''}.`}
                    aria-pressed={selectedProspect === p.prospect.id}
                    onFocus={() => setActivePin(p.prospect.id)}
                    onKeyDown={(e) => onPinKey(e, p.prospect.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      openProspect(p.prospect.id);
                    }}
                  >
                    {p.overlap && <circle className="pin-halo" r={8.5} />}
                    <circle className="pin-dot" r={selectedProspect === p.prospect.id ? 7.5 : 5.5} />
                    <title>
                      {`${p.prospect.name}, ${p.prospect.hq_city}${p.unverified ? ' (location unverified)' : ''}${p.overlap ? ' (3+ coverage roles)' : ''}`}
                    </title>
                  </g>
                </g>
              ))}
            </g>
          </g>
        </svg>
      )}
      <div className="zoom-buttons">
        <button type="button" className="btn icon" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.6)}>
          +
        </button>
        <button type="button" className="btn icon" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.6)}>
          −
        </button>
      </div>
    </div>
  );
}

interface RegionsProps {
  regions: { code: string; name: string; d: string }[];
  index: Map<string, RegionAssignment>;
  focusCodes: Set<string> | null;
  labels: Map<string, string>;
  /** The one region in the tab order; arrow keys move between the rest. */
  tabCode: string | null;
  onHover(code: string | null, x: number, y: number): void;
  onSelect(code: string, x: number, y: number): void;
  onKey(e: React.KeyboardEvent, code: string): void;
  onFocusRegion(el: Element, code: string): void;
}

/** The region fills. Memoized so pin and hover changes do not redraw 63 paths. */
const Regions = memo(function Regions({
  regions,
  index,
  focusCodes,
  labels,
  tabCode,
  onHover,
  onSelect,
  onKey,
  onFocusRegion,
}: RegionsProps) {
  return (
    <g
      className="regions"
      role="group"
      aria-label="States and provinces"
      onMouseMove={(e) => {
        const code = (e.target as Element).getAttribute('data-code');
        const box = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
        onHover(code, e.clientX - box.left, e.clientY - box.top);
      }}
      onMouseLeave={() => onHover(null, 0, 0)}
      onClick={(e) => {
        const code = (e.target as Element).getAttribute('data-code');
        const box = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
        if (code) onSelect(code, e.clientX - box.left, e.clientY - box.top);
      }}
    >
      {regions.map((r) => {
        const a = index.get(r.code);
        const dim = focusCodes !== null && !focusCodes.has(r.code);
        return (
          <path
            key={r.code}
            d={r.d}
            data-code={r.code}
            className={`region${a ? '' : ' unassigned'}${dim ? ' dim' : ''}`}
            style={a ? { fill: a.territory.color } : undefined}
            role="button"
            tabIndex={r.code === tabCode ? 0 : -1}
            aria-label={labels.get(r.code)}
            onKeyDown={(e) => onKey(e, r.code)}
            onFocus={(e) => onFocusRegion(e.currentTarget, r.code)}
            onBlur={() => onHover(null, 0, 0)}
          />
        );
      })}
    </g>
  );
});

interface PlacedPin {
  prospect: Prospect;
  x: number;
  y: number;
  unverified: boolean;
  overlap: boolean;
}

/**
 * Projects each prospect to its HQ. A prospect without coordinates sits at
 * its state's center, spread on a small spiral so several stay clickable.
 */
function placePins(
  list: Prospect[],
  geo: {
    projection: (p: [number, number]) => [number, number] | null;
    byCode: Map<string, { center: [number, number] }>;
  },
  index: DataIndex,
): PlacedPin[] {
  const unverifiedSeen = new Map<string, number>();
  const out: PlacedPin[] = [];
  for (const p of list) {
    const overlap = hasOverlap(index, p.id);
    if (p.lat !== null && p.lng !== null) {
      const xy = geo.projection([p.lng, p.lat]);
      if (xy) out.push({ prospect: p, x: xy[0], y: xy[1], unverified: false, overlap });
      continue;
    }
    const center = geo.byCode.get(p.state)?.center;
    if (!center) continue;
    const n = unverifiedSeen.get(p.state) ?? 0;
    unverifiedSeen.set(p.state, n + 1);
    const angle = n * 2.4;
    const radius = n === 0 ? 0 : 1.2 * Math.sqrt(n);
    out.push({
      prospect: p,
      x: center[0] + radius * Math.cos(angle),
      y: center[1] + radius * Math.sin(angle),
      unverified: true,
      overlap,
    });
  }
  // Overlap pins draw last so their halos stay visible.
  return out.sort((a, b) => Number(a.overlap) - Number(b.overlap));
}

/** Centroid of a region's largest polygon, so Michigan's count sits on the lower peninsula. */
function largestPartCentroid(f: Parameters<typeof mainBounds>[0], path: ReturnType<typeof geoPath>): [number, number] {
  if (f.geometry.type === 'MultiPolygon') {
    let best: [number, number] = path.centroid(f);
    let bestArea = -1;
    for (const coordinates of f.geometry.coordinates) {
      const part = { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates } };
      const a = path.area(part);
      if (a > bestArea) {
        bestArea = a;
        best = path.centroid(part);
      }
    }
    return best;
  }
  return path.centroid(f);
}
