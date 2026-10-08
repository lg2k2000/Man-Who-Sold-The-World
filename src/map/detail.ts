import { feature, mesh } from 'topojson-client';
import type { FeatureCollection, GeoJsonProperties, Geometry, MultiLineString, Point } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

export const DETAIL_URL = `${import.meta.env.BASE_URL}geo/detail.topo.json`;

export interface CityProps {
  name: string;
  pop: number;
  rank: number;
  cap: number;
}

/** The map's detail layers, unprojected. */
export interface Detail {
  cities: FeatureCollection<Point, CityProps>;
  majorRoads: FeatureCollection;
  minorRoads: FeatureCollection;
  majorRivers: FeatureCollection;
  minorRivers: FeatureCollection;
  lakes: FeatureCollection;
  urban: FeatureCollection;
  /** Lines between US counties (not their outer edge, which the state borders already draw). */
  countyLines: MultiLineString;
}

type DetailTopology = Topology<{
  cities: GeometryCollection<CityProps>;
  roads: GeometryCollection<{ cls: 'major' | 'minor' }>;
  rivers: GeometryCollection<{ scalerank: number }>;
  lakes: GeometryCollection<{ scalerank: number }>;
  urban: GeometryCollection;
  counties: GeometryCollection<{ name: string }>;
}>;

function only<P extends GeoJsonProperties>(fc: FeatureCollection<Geometry, P>, keep: (p: P) => boolean): FeatureCollection {
  return { type: 'FeatureCollection', features: fc.features.filter((f) => keep(f.properties)) };
}

export function detailFromTopology(topo: DetailTopology): Detail {
  const o = topo.objects;
  if (topo?.type !== 'Topology' || !o?.cities || !o.roads || !o.counties) throw new Error('The map detail file is damaged.');
  const roads = feature(topo, o.roads) as FeatureCollection<Geometry, { cls: string }>;
  const rivers = feature(topo, o.rivers) as FeatureCollection<Geometry, { scalerank: number }>;
  return {
    cities: feature(topo, o.cities) as FeatureCollection<Point, CityProps>,
    majorRoads: only(roads, (p) => p.cls === 'major'),
    minorRoads: only(roads, (p) => p.cls !== 'major'),
    majorRivers: only(rivers, (p) => p.scalerank <= 5),
    minorRivers: only(rivers, (p) => p.scalerank > 5),
    lakes: feature(topo, o.lakes) as FeatureCollection,
    urban: feature(topo, o.urban) as FeatureCollection,
    countyLines: mesh(topo, o.counties, (a, b) => a !== b),
  };
}

/** Loads the detail layers. They are extra; the map works without them. */
export async function loadDetail(url = DETAIL_URL): Promise<Detail> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Map detail failed to load (HTTP ${res.status}).`);
  return detailFromTopology((await res.json()) as DetailTopology);
}

export interface LayerSettings {
  regionNames: boolean;
  cities: boolean;
  highways: boolean;
  water: boolean;
  metro: boolean;
  counties: boolean;
}

export const DEFAULT_LAYERS: LayerSettings = {
  regionNames: true,
  cities: true,
  highways: true,
  water: true,
  metro: true,
  counties: true,
};

/** Reads saved layer settings, keeping the default for anything missing or malformed. */
export function readLayers(value: unknown): LayerSettings {
  const saved = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof LayerSettings, unknown>>;
  const out = { ...DEFAULT_LAYERS };
  for (const key of Object.keys(DEFAULT_LAYERS) as (keyof LayerSettings)[]) {
    if (typeof saved[key] === 'boolean') out[key] = saved[key];
  }
  return out;
}

export const LAYER_LABELS: Record<keyof LayerSettings, string> = {
  regionNames: 'State and province names',
  cities: 'Cities and towns',
  highways: 'Highways',
  water: 'Rivers and lakes',
  metro: 'Metro areas',
  counties: 'US county lines',
};

/** When a layer shows only part of the time, so a switched-on layer that looks empty is explained. */
export const LAYER_HINTS: Partial<Record<keyof LayerSettings, string>> = {
  regionNames: 'Shown when zoomed in from the continent view',
  cities: 'More towns appear as you zoom in',
  counties: 'Shown when zoomed in to a state',
};

/** Zoom levels at which the finer layers appear. */
export const SHOW_AT = {
  /** The white edge along highways; at continent zoom it only blurs them and slows panning. */
  roadCasing: 2,
  minorRoads: 2.2,
  minorRivers: 2.5,
  counties: 3,
};
