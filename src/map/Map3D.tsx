import { useEffect, useMemo, useRef, useState } from 'react';
import { Deck, WebMercatorViewport, type PickingInfo } from '@deck.gl/core';
import { ColumnLayer, GeoJsonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { geoBounds, geoCentroid } from 'd3-geo';
import type { Feature, Geometry, Point, Polygon } from 'geojson';
import type { RegionAssignment, TerritoryConfig } from '../config/territories';
import {
  companyStageBand,
  filterCompanies,
  money,
  moneyShort,
  STAGE_BAND_LABELS,
  STAGE_BANDS,
  territoryCodes,
  type StageBand,
} from '../data/derive';
import type { Company } from '../data/types';
import { useApp } from '../state/app';
import { companyUpkeep, latestTouches, localToday, UPKEEP_BAND_LABELS, upkeepBand } from '../data/upkeep';
import type { CityProps, Detail, LayerSettings } from './detail';
import { HAWAII, type Boundaries, type RegionFeature } from './geo';
import { labelWidth, maxRankForZoom } from './labels';
import { makeCityLocator } from './locate';
import { LayersMenu } from '../ui/LayersMenu';

type RGBA = [number, number, number, number];

/**
 * Column colors by stage band: one green hue, light to dark for early to late on the light map
 * and dark to bright on the dark map, checked with the dataviz palette validator against each
 * map surface. A company with no open deal is a short gray stub.
 */
const BAND_COLORS: Record<'light' | 'dark', Record<StageBand | 'none', string>> = {
  light: { early: '#2fb48f', active: '#00836a', late: '#00513f', unset: '#8b969e', none: '#b6bec4' },
  dark: { early: '#11916f', active: '#3cc79c', late: '#9be6cb', unset: '#76828b', none: '#4f5961' },
};

/** The tallest column as a share of the view's height; heights are linear in open pipeline so they compare honestly. */
const TALLEST_SHARE = 0.2;
/** A company with no open deal is a stub this share of the tallest column. */
const STUB = 0.012;
/** Column radius in screen pixels at the current zoom. */
const RADIUS_PX = 2.4;

/** Web Mercator zoom at which the flat map's continent view (its zoom 1) sits, for reusing its town thresholds. */
const FLAT_ZOOM_ONE = 2.8;
/** Detail that only reads close in: county lines, small roads and rivers. */
const CLOSE_ZOOM = 5.5;
/** The app's own font stack; deck.gl's default is monospace. */
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
/** A column's card shows only after the pointer rests on it this long, so sweeping across the map stays quiet. */
const TIP_DELAY_MS = 300;

/** Ground meters per screen pixel in Web Mercator at a zoom and latitude. */
function metersPerPixel(zoom: number, latitude: number): number {
  return (156_543.03 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

type Town = Feature<Point, CityProps>;
type StateName = { code: string; name: string; at: [number, number] };

interface Column {
  company: Company;
  position: [number, number];
  pipeline: number;
  band: StageBand | null;
  elevation: number;
  color: RGBA;
  outside: boolean;
  unverified: boolean;
}

interface Props {
  boundaries: Boundaries;
  detail: Detail | null;
  config: TerritoryConfig;
  index: Map<string, RegionAssignment>;
  size: { w: number; h: number };
  dark: boolean;
  insets: { left: number; right: number };
  layers: LayerSettings;
}

function rgba(hex: string, alpha = 255): RGBA {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

/** Bounds of a set of regions in degrees, west-south and east-north, ignoring the Aleutians' wrap past 180°. */
function regionsBounds(features: RegionFeature[]): [[number, number], [number, number]] | null {
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  for (const f of features) {
    const [[x0, y0], [x1, y1]] = geoBounds(f);
    w = Math.min(w, x0 > x1 ? -180 : x0);
    e = Math.max(e, x1);
    s = Math.min(s, y0);
    n = Math.max(n, y1);
  }
  return w < e
    ? [
        [Math.max(w, -170), s],
        [e, n],
      ]
    : null;
}

/** Centroid of a region's largest polygon, so Alaska's column stands on the mainland. */
function regionCenter(f: RegionFeature): [number, number] {
  if (f.geometry.type !== 'MultiPolygon') return geoCentroid(f) as [number, number];
  let best: Feature<Polygon> | null = null;
  let bestSpan = -1;
  for (const coords of f.geometry.coordinates) {
    const part: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: coords } };
    const [[x0, y0], [x1, y1]] = geoBounds(part);
    const span = Math.abs(x1 - x0) * Math.abs(y1 - y0);
    if (span > bestSpan) {
      bestSpan = span;
      best = part;
    }
  }
  return geoCentroid(best ?? f) as [number, number];
}

export function Map3D({ boundaries, detail, config, index, size, dark, insets, layers: show }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const deck = useRef<Deck | null>(null);
  const [tip, setTip] = useState<{ col: Column; x: number; y: number } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const data = useApp((s) => s.data);
  const dataIndex = useApp((s) => s.index);
  const filters = useApp((s) => s.filters);
  const myArea = useApp((s) => s.settings.myArea);
  const focusId = useApp((s) => s.focusTerritoryId);
  const openCompany = useApp((s) => s.openCompany);
  const upkeepDays = useApp((s) => s.settings.upkeepDays);
  const latest = useMemo(() => latestTouches(data), [data]);
  const palette = BAND_COLORS[dark ? 'dark' : 'light'];

  const focusCodes = useMemo(() => (focusId ? territoryCodes(config, focusId, myArea) : null), [config, focusId, myArea]);
  const byCode = useMemo(() => new Map(boundaries.regions.map((r) => [r.properties.code, r])), [boundaries]);
  const centers = useMemo(() => new Map(boundaries.regions.map((r) => [r.properties.code, regionCenter(r)])), [boundaries]);
  const locate = useMemo(() => (detail ? makeCityLocator(detail.cities, boundaries.regions) : null), [detail, boundaries]);

  const columns = useMemo(() => {
    const list = filterCompanies(data, dataIndex, config, { ...filters, territoryId: null }, myArea);
    let max = 0;
    for (const c of list) max = Math.max(max, dataIndex.openPipeline.get(c.id) ?? 0);
    const stacked = new Map<string, number>();
    const out: Column[] = [];
    for (const c of list) {
      let position: [number, number] | null = c.lat !== null && c.lng !== null ? [c.lng, c.lat] : null;
      const unverified = position === null;
      if (!position) {
        const town = c.hq_city && locate ? locate(c.hq_city, c.state!) : null;
        const base = town ?? centers.get(c.state!) ?? null;
        if (!base) continue;
        // Several companies on one spot spread on a small spiral so each column stays clickable.
        const spot = `${base[0].toFixed(3)},${base[1].toFixed(3)}`;
        const k = stacked.get(spot) ?? 0;
        stacked.set(spot, k + 1);
        const r = k === 0 ? 0 : 0.11 * Math.sqrt(k);
        position = [base[0] + r * Math.cos(k * 2.4) * 1.4, base[1] + r * Math.sin(k * 2.4)];
      }
      const pipeline = dataIndex.openPipeline.get(c.id) ?? 0;
      const band = companyStageBand(dataIndex, c.id);
      const outside = focusCodes !== null && !focusCodes.has(c.state!);
      out.push({
        company: c,
        position,
        pipeline,
        band,
        elevation: pipeline > 0 && max > 0 ? Math.max(STUB * 2, pipeline / max) : STUB,
        color: rgba(band ? palette[band] : palette.none, outside ? 110 : 255),
        outside,
        unverified,
      });
    }
    return { list: out, max };
  }, [data, dataIndex, config, filters, myArea, locate, centers, focusCodes, palette]);

  // Column size follows the camera so columns stay readable at every zoom.
  const [camera, setCamera] = useState({ zoom: 4, latitude: 45 });
  // The full camera once it settles, for placing town names in screen space.
  const [settledView, setSettledView] = useState<{
    longitude: number;
    latitude: number;
    zoom: number;
    pitch: number;
    bearing: number;
  } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mpp = metersPerPixel(camera.zoom, camera.latitude);
  const radius = RADIUS_PX * mpp;
  const elevationScale = TALLEST_SHARE * Math.max(size.h, 300) * mpp;

  // The same detail as the flat map, under the columns, with the layers menu's switches.
  const close = camera.zoom >= CLOSE_ZOOM;
  const detailLayers = useMemo(() => {
    if (!detail) return [];
    const ink = dark
      ? { water: '#1b2026', river: '#4d6a80', road: '#8a7a5c', minorRoad: '#5f5a50', county: '#454e56', urban: '#4a535b' }
      : { water: '#eef1f4', river: '#8fb0c8', road: '#b39a6c', minorRoad: '#cbbd9f', county: '#c3c9ce', urban: '#c4c9ce' };
    const lines = (id: string, data: unknown, color: string, width: number, visible: boolean) =>
      new GeoJsonLayer({
        id,
        data: data as Feature<Geometry>[],
        visible,
        filled: false,
        stroked: true,
        getLineColor: rgba(color),
        lineWidthUnits: 'pixels',
        getLineWidth: width,
      });
    return [
      new GeoJsonLayer({
        id: 'urban',
        data: detail.urban as never,
        visible: show.metro,
        filled: true,
        stroked: false,
        getFillColor: rgba(ink.urban, 110),
      }),
      new GeoJsonLayer({
        id: 'lakes',
        data: detail.lakes as never,
        visible: show.water,
        filled: true,
        stroked: false,
        getFillColor: rgba(ink.water),
      }),
      lines('counties', { type: 'Feature', properties: {}, geometry: detail.countyLines }, ink.county, 0.6, show.counties && close),
      lines('rivers', detail.majorRivers, ink.river, 1, show.water),
      lines('minor-rivers', detail.minorRivers, ink.river, 0.7, show.water && close),
      lines('roads', detail.majorRoads, ink.road, 1.3, show.highways),
      lines('minor-roads', detail.minorRoads, ink.minorRoad, 0.8, show.highways && close),
    ];
  }, [detail, dark, show, close]);

  // Town and state names over everything, thinned by zoom like the flat map and kept from overlapping.
  const maxRank = maxRankForZoom(2 ** (camera.zoom - FLAT_ZOOM_ONE));
  const labelLayers = useMemo(() => {
    const text = dark ? '#e6eaed' : '#1f2a33';
    const halo = dark ? '#151b20' : '#ffffff';
    const towns = placeTowns(
      (detail?.cities.features ?? []).filter(
        (c) => c.properties.rank <= maxRank || (c.properties.cap > 0 && c.properties.rank <= maxRank + 2),
      ),
      settledView,
      size,
    );
    const overTop = { depthCompare: 'always' as const };
    return [
      new ScatterplotLayer<Town>({
        id: 'town-dots',
        data: towns,
        visible: show.cities,
        getPosition: (c) => c.geometry.coordinates as [number, number],
        radiusUnits: 'pixels',
        getRadius: 2.2,
        getFillColor: rgba(text),
        stroked: true,
        getLineColor: rgba(halo),
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        parameters: overTop,
      }),
      new TextLayer<StateName>({
        id: 'state-names',
        data: show.regionNames
          ? boundaries.regions.map((r) => ({
              code: r.properties.code,
              name: r.properties.name.toUpperCase(),
              at: centers.get(r.properties.code)!,
            }))
          : [],
        getPosition: (r) => r.at,
        getText: (r) => r.name,
        getSize: 12,
        sizeMinPixels: 11,
        getColor: rgba(text, 140),
        fontWeight: 700,
        characterSet: 'auto',
        fontFamily: FONT,
        fontSettings: { sdf: true },
        outlineWidth: 4,
        outlineColor: rgba(halo, 200),
        parameters: overTop,
      }),
      new TextLayer<Town>({
        id: 'town-names',
        data: show.cities ? towns : [],
        getPosition: (c) => c.geometry.coordinates as [number, number],
        getText: (c) => (c.properties as CityProps).name,
        getSize: 12,
        // Names toward the horizon would otherwise shrink with the tilt until they cannot be read.
        sizeMinPixels: 11,
        sizeMaxPixels: 13,
        getColor: rgba(text),
        getPixelOffset: [6, 0],
        getTextAnchor: 'start',
        getAlignmentBaseline: 'center',
        characterSet: 'auto',
        fontFamily: FONT,
        fontSettings: { sdf: true },
        outlineWidth: 4,
        outlineColor: rgba(halo, 230),
        parameters: overTop,
      }),
    ];
  }, [detail, dark, show, maxRank, boundaries, centers, settledView, size]);

  const layers = useMemo(() => {
    const land = dark ? '#3a434b' : '#d9dde1';
    return [
      new GeoJsonLayer({
        id: 'countries',
        data: boundaries.countries as Feature<Geometry>[],
        filled: true,
        stroked: false,
        getFillColor: rgba(dark ? '#30373d' : '#e5e3df'),
      }),
      new GeoJsonLayer<RegionFeature['properties']>({
        id: 'regions',
        data: boundaries.regions,
        filled: true,
        stroked: true,
        getFillColor: (f) => {
          const t = index.get(f.properties.code)?.territory;
          const inFocus = focusCodes === null || focusCodes.has(f.properties.code);
          // Territory colors stay as a tint so the columns carry the eye.
          return rgba(t?.color ?? land, inFocus ? 120 : 45);
        },
        getLineColor: rgba(dark ? '#1b2126' : '#ffffff', 220),
        lineWidthMinPixels: 1,
        updateTriggers: { getFillColor: [focusCodes, dark] },
      }),
      ...detailLayers,
      new ColumnLayer<Column>({
        id: 'pipeline',
        data: columns.list,
        diskResolution: 14,
        radius,
        elevationScale,
        extruded: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: rgba(dark ? '#ffffff' : '#1f2a33', 90),
        getPosition: (d) => d.position,
        getElevation: (d) => d.elevation,
        getFillColor: (d) => d.color,
        material: { ambient: 0.55, diffuse: 0.6, shininess: 24 },
        updateTriggers: { getFillColor: [palette, focusCodes] },
      }),
      ...labelLayers,
    ];
  }, [boundaries, index, focusCodes, columns, dark, palette, radius, elevationScale, detailLayers, labelLayers]);

  // Start framed on the companies in the focused territory or area (Mercator stretches the far
  // north, so framing whole regions would give Alaska most of the screen), tilted so columns read as height.
  const initialView = useMemo(() => {
    const here = columns.list.filter((c) => !c.outside && c.company.state !== HAWAII);
    let bounds: [[number, number], [number, number]] | null = null;
    if (here.length >= 2) {
      const xs = here.map((c) => c.position[0]);
      const ys = here.map((c) => c.position[1]);
      bounds = [
        [Math.min(...xs) - 0.6, Math.min(...ys) - 0.6],
        [Math.max(...xs) + 0.6, Math.max(...ys) + 0.6],
      ];
    } else {
      const codes = focusCodes ? [...focusCodes].filter((c) => c !== HAWAII || focusCodes.size === 1) : null;
      const feats = (codes ?? [...byCode.keys()].filter((c) => c !== HAWAII)).flatMap((c) => byCode.get(c) ?? []);
      bounds = regionsBounds(feats);
    }
    bounds ??= [
      [-168, 24],
      [-52, 72],
    ];
    const w = Math.max(size.w, 200);
    const h = Math.max(size.h, 200);
    const fit = new WebMercatorViewport({ width: w, height: h }).fitBounds(bounds, {
      padding: { left: Math.min(insets.left, w / 3), right: Math.min(insets.right, w / 3), top: 60, bottom: 30 },
    });
    return { longitude: fit.longitude, latitude: fit.latitude - 1, zoom: fit.zoom, pitch: 50, bearing: -12 };
    // Framing follows the focus only; filters, data, and resizing should not snap the camera back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCodes, byCode]);

  useEffect(() => {
    if (!host.current) return;
    const d = new Deck({
      parent: host.current,
      initialViewState: initialView,
      controller: { dragRotate: true, touchRotate: true, keyboard: true },
      layers: [],
      onViewStateChange: ({ viewState }) => {
        const v = viewState as { zoom: number; latitude: number };
        const next = { zoom: Math.round(v.zoom * 4) / 4, latitude: Math.round(v.latitude) };
        setCamera((c) => (c.zoom === next.zoom && c.latitude === next.latitude ? c : next));
        if (settleTimer.current) clearTimeout(settleTimer.current);
        const full = viewState as { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number };
        settleTimer.current = setTimeout(() => setSettledView({ ...full }), 180);
      },
      getCursor: ({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'),
      onHover: (info: PickingInfo<Column>) => {
        if (tipTimer.current) clearTimeout(tipTimer.current);
        tipTimer.current = null;
        const col = info.object;
        if (!col) {
          setTip(null);
          return;
        }
        const next = { col, x: info.x, y: info.y };
        setTip((cur) => (cur && cur.col === col ? cur : null));
        tipTimer.current = setTimeout(() => setTip(next), TIP_DELAY_MS);
      },
      onDragStart: () => {
        if (tipTimer.current) clearTimeout(tipTimer.current);
        setTip(null);
      },
      onClick: (info: PickingInfo<Column>) => {
        if (info.object) openCompany(info.object.company.id, undefined, { fromMap: true });
      },
    });
    deck.current = d;
    return () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      d.finalize();
      deck.current = null;
    };
    // The deck is made once; layers and camera are pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    deck.current?.setProps({
      layers,
      onClick: (info: PickingInfo<Column>) => info.object && openCompany(info.object.company.id, undefined, { fromMap: true }),
    });
  }, [layers, openCompany]);

  useEffect(() => {
    deck.current?.setProps({ initialViewState: { ...initialView, transitionDuration: 600 } });
    setCamera({ zoom: Math.round(initialView.zoom * 4) / 4, latitude: Math.round(initialView.latitude) });
    setSettledView(initialView);
  }, [initialView]);

  const shown = columns.list.filter((c) => !c.outside);
  const total = shown.reduce((a, c) => a + c.pipeline, 0);

  return (
    <div className="map3d">
      <div
        ref={host}
        className="map3d-canvas"
        role="img"
        aria-label={`3D view: ${shown.length} companies with ${money(total)} open pipeline. Column height is open pipeline. Use the flat map for keyboard access.`}
      />
      {tip && (
        // Placed below and right of the pointer so the cursor never covers the name.
        <div
          className="map3d-tip"
          style={{ left: Math.min(tip.x + 16, size.w - 260), top: Math.min(tip.y + 18, size.h - 110) }}
          role="status"
        >
          <strong>{tip.col.company.name}</strong>
          <span>{tip.col.pipeline > 0 ? `Open pipeline ${money(tip.col.pipeline)}` : 'No open deal'}</span>
          {tip.col.band && <span>{STAGE_BAND_LABELS[tip.col.band]}</span>}
          {(() => {
            const u = companyUpkeep(dataIndex, latest, tip.col.company.id, localToday(), upkeepDays);
            if (!u) return null;
            return (
              <span>
                {u.pastDue ? 'Upkeep empty: close date passed' : `Upkeep: ${UPKEEP_BAND_LABELS[upkeepBand(u.level)]}, ${u.level}%`}
              </span>
            );
          })()}
          {(tip.col.company.hq_city || tip.col.unverified) && (
            <span className="muted">
              {[tip.col.company.hq_city, tip.col.unverified ? 'location unverified' : ''].filter(Boolean).join(', ')}
            </span>
          )}
        </div>
      )}
      <div className="zoom-buttons">
        <LayersMenu status={detail ? 'ready' : 'loading'} />
      </div>
      <aside className="map3d-legend" aria-label="3D legend">
        <h2>Open pipeline in 3D</h2>
        <p className="map3d-total">
          {moneyShort(total)} across {shown.length} companies
        </p>
        <p className="map3d-note">Height is open pipeline; the tallest is {moneyShort(columns.max)}.</p>
        <ul>
          {STAGE_BANDS.map((b) => (
            <li key={b}>
              <span className="swatch" style={{ background: palette[b] }} aria-hidden="true" />
              {STAGE_BAND_LABELS[b]}
            </li>
          ))}
          <li>
            <span className="swatch" style={{ background: palette.none }} aria-hidden="true" />
            No open deal
          </li>
        </ul>
        <p className="map3d-note">Drag to move. Right-drag or Ctrl-drag to tilt and turn. Click a column to open the company.</p>
      </aside>
    </div>
  );
}

/**
 * Picks the town names to draw once the camera settles: capitals and bigger places first, each kept
 * only if its name clears every name already placed, so labels never overlap.
 */
function placeTowns(
  towns: Town[],
  view: { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number } | null,
  size: { w: number; h: number },
): Town[] {
  if (!view || size.w < 50) return [];
  const vp = new WebMercatorViewport({ ...view, width: size.w, height: size.h });
  const sorted = [...towns].sort(
    (a, b) => b.properties.cap - a.properties.cap || a.properties.rank - b.properties.rank || b.properties.pop - a.properties.pop,
  );
  const kept: Town[] = [];
  const boxes: [number, number, number, number][] = [];
  for (const t of sorted) {
    const [x = NaN, y = NaN] = vp.project(t.geometry.coordinates as [number, number]);
    if (!(x > -20 && x < size.w + 20 && y > -10 && y < size.h + 10)) continue;
    const box: [number, number, number, number] = [x - 4, y - 9, x + 8 + labelWidth(t.properties.name, 6.6), y + 9];
    if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    kept.push(t);
    if (kept.length >= 160) break;
  }
  return kept;
}
