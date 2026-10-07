import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import type { RegionAssignment, TerritoryConfig } from '../config/territories';
import { HAWAII, mainProjection, type Boundaries } from './geo';
import { fitTransform, mainBounds, unionBounds, type Bounds } from './bounds';

export interface MapInsets {
  /** Space the legend covers on the left, kept clear when framing a territory. */
  left: number;
}

interface Props {
  boundaries: Boundaries;
  config: TerritoryConfig;
  index: Map<string, RegionAssignment>;
  focusId: string | null;
  focusRequest: number;
  insets: MapInsets;
}

const MAX_ZOOM = 40;

export function MapView({ boundaries, config, index, focusId, focusRequest, insets }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const patternRef = useRef<SVGPatternElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const framedOnce = useRef(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

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
      }));
    const countries = boundaries.countries.map((f, i) => ({ key: `${f.properties.iso}-${i}`, d: path(f) ?? '' }));
    return { regions, countries };
  }, [boundaries, size]);

  // Pan and zoom. The layer transform and the hatch scale update outside React
  // so dragging stays smooth.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !size) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.8, MAX_ZOOM])
      .translateExtent([
        [-size.w * 0.5, -size.h * 0.5],
        [size.w * 1.5, size.h * 1.5],
      ])
      .on('zoom', (event) => {
        const t = event.transform;
        layerRef.current?.setAttribute('transform', t.toString());
        patternRef.current?.setAttribute('patternTransform', `scale(${1 / t.k}) rotate(45)`);
      });
    const svg = select(svgEl);
    svg.call(z).on('dblclick.zoom', null);
    zoomRef.current = z;
    return () => {
      svg.on('.zoom', null);
    };
  }, [size]);

  // Frame the focused territory, or the whole continent.
  useEffect(() => {
    const svgEl = svgRef.current;
    const z = zoomRef.current;
    if (!svgEl || !z || !size || !geo) return;
    let target = zoomIdentity;
    if (focusId) {
      const codes = new Set(config.territories.find((t) => t.id === focusId)?.members.map((m) => m.code) ?? []);
      const list: Bounds[] = geo.regions.filter((r) => codes.has(r.code)).map((r) => r.bounds);
      if (list.length) {
        const pad = 24;
        const { k, x, y } = fitTransform(
          unionBounds(list),
          { x0: insets.left + pad, y0: pad, x1: size.w - pad, y1: size.h - pad },
          MAX_ZOOM,
        );
        target = zoomIdentity.translate(x, y).scale(k);
      }
    }
    const svg = select(svgEl);
    if (framedOnce.current) svg.transition().duration(650).call(z.transform, target);
    else svg.call(z.transform, target);
    framedOnce.current = true;
  }, [focusRequest, focusId, geo, size, config, insets.left]);

  const focusCodes = useMemo(() => {
    if (!focusId) return null;
    return new Set(config.territories.find((t) => t.id === focusId)?.members.map((m) => m.code) ?? []);
  }, [config, focusId]);

  return (
    <div className="map" ref={containerRef}>
      {size && geo && (
        <svg ref={svgRef} width={size.w} height={size.h} className="map-svg" role="img" aria-label="Map of North America colored by territory">
          <defs>
            <pattern id="hatch" ref={patternRef} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" className="hatch-line" />
            </pattern>
          </defs>
          <rect width={size.w} height={size.h} className="map-water" />
          <g ref={layerRef}>
            <g className="countries">
              {geo.countries.map((c) => (
                <path key={c.key} d={c.d} />
              ))}
            </g>
            <g className="regions">
              {geo.regions.map((r) => {
                const a = index.get(r.code);
                const dim = focusCodes !== null && !focusCodes.has(r.code);
                return (
                  <path
                    key={r.code}
                    d={r.d}
                    data-code={r.code}
                    className={`region${a ? '' : ' unassigned'}${dim ? ' dim' : ''}`}
                    style={a ? { fill: a.territory.color } : undefined}
                  >
                    <title>{`${r.name}: ${a ? a.territory.name : 'unassigned'}${a && !a.confirmed ? ' (unconfirmed)' : ''}`}</title>
                  </path>
                );
              })}
            </g>
            <g className="hatches" aria-hidden="true">
              {geo.regions
                .filter((r) => index.get(r.code)?.confirmed === false)
                .map((r) => {
                  const dim = focusCodes !== null && !focusCodes.has(r.code);
                  return <path key={r.code} d={r.d} className={`hatch${dim ? ' dim' : ''}`} fill="url(#hatch)" />;
                })}
            </g>
          </g>
        </svg>
      )}
    </div>
  );
}
