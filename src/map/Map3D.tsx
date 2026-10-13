import { useEffect, useMemo, useRef, useState } from 'react';
import { Deck, WebMercatorViewport, type PickingInfo } from '@deck.gl/core';
import { ColumnLayer, GeoJsonLayer } from '@deck.gl/layers';
import { geoBounds, geoCentroid } from 'd3-geo';
import type { Feature, Geometry, Polygon } from 'geojson';
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
import type { Detail } from './detail';
import { HAWAII, type Boundaries, type RegionFeature } from './geo';
import { makeCityLocator } from './locate';

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
const TALLEST_SHARE = 0.26;
/** A company with no open deal is a stub this share of the tallest column. */
const STUB = 0.012;
/** Column radius in screen pixels at the current zoom. */
const RADIUS_PX = 3.5;

/** Ground meters per screen pixel in Web Mercator at a zoom and latitude. */
function metersPerPixel(zoom: number, latitude: number): number {
  return (156_543.03 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

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

export function Map3D({ boundaries, detail, config, index, size, dark, insets }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const deck = useRef<Deck | null>(null);
  const data = useApp((s) => s.data);
  const dataIndex = useApp((s) => s.index);
  const filters = useApp((s) => s.filters);
  const myArea = useApp((s) => s.settings.myArea);
  const focusId = useApp((s) => s.focusTerritoryId);
  const openCompany = useApp((s) => s.openCompany);
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
  const mpp = metersPerPixel(camera.zoom, camera.latitude);
  const radius = RADIUS_PX * mpp;
  const elevationScale = TALLEST_SHARE * Math.max(size.h, 300) * mpp;

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
    ];
  }, [boundaries, index, focusCodes, columns, dark, palette, radius, elevationScale]);

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
      },
      getCursor: ({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'),
      getTooltip: (info: PickingInfo<Column>) => {
        const c = info.object;
        if (!c) return null;
        const lines = [
          `<strong>${escapeHtml(c.company.name)}</strong>`,
          c.pipeline > 0 ? `Open pipeline ${escapeHtml(money(c.pipeline))}` : 'No open deal',
          c.band ? escapeHtml(STAGE_BAND_LABELS[c.band]) : '',
          [c.company.hq_city, c.unverified ? 'location unverified' : ''].filter(Boolean).map(escapeHtml).join(', '),
        ].filter(Boolean);
        return { html: lines.join('<br>'), className: 'deck-tip' };
      },
      onClick: (info: PickingInfo<Column>) => {
        if (info.object) openCompany(info.object.company.id);
      },
    });
    deck.current = d;
    return () => {
      d.finalize();
      deck.current = null;
    };
    // The deck is made once; layers and camera are pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    deck.current?.setProps({ layers, onClick: (info: PickingInfo<Column>) => info.object && openCompany(info.object.company.id) });
  }, [layers, openCompany]);

  useEffect(() => {
    deck.current?.setProps({ initialViewState: { ...initialView, transitionDuration: 600 } });
    setCamera({ zoom: Math.round(initialView.zoom * 4) / 4, latitude: Math.round(initialView.latitude) });
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
