import { geoConicConformal, geoPath, type GeoProjection } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry, MultiLineString, MultiPoint } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';

export interface RegionProps {
  code: string;
  name: string;
  country: 'US' | 'CA';
}

export interface CountryProps {
  iso: string;
  name: string;
}

export type RegionFeature = Feature<Geometry, RegionProps>;
export type CountryFeature = Feature<Geometry, CountryProps>;

export interface Boundaries {
  regions: RegionFeature[];
  countries: CountryFeature[];
  /** The outer edge of the US and Canada (coasts and borders with other countries), without Hawaii. */
  coast: MultiLineString;
}

export const HAWAII = 'US-HI';
export const GEO_URL = `${import.meta.env.BASE_URL}geo/north-america.topo.json`;

type BoundaryTopology = Topology<{
  regions: GeometryCollection<RegionProps>;
  countries: GeometryCollection<CountryProps>;
}>;

export function boundariesFromTopology(topo: BoundaryTopology): Boundaries {
  if (topo?.type !== 'Topology' || !topo.objects?.regions || !topo.objects?.countries) {
    throw new Error('The map boundaries file is damaged: it has no regions or countries.');
  }
  const regions = feature(topo, topo.objects.regions) as FeatureCollection<Geometry, RegionProps>;
  const countries = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, CountryProps>;
  const mainland = {
    ...topo.objects.regions,
    geometries: topo.objects.regions.geometries.filter((g) => (g.properties as RegionProps | undefined)?.code !== HAWAII),
  };
  // Arcs used by only one region are the outside edge of the two countries.
  const coast = mesh(topo, mainland, (a, b) => a === b);
  return { regions: regions.features, countries: countries.features, coast };
}

export async function loadBoundaries(url = GEO_URL): Promise<Boundaries> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('The map boundaries could not be downloaded. Check the connection and try again.');
  }
  if (!res.ok) throw new Error(`The map boundaries failed to load (HTTP ${res.status}).`);
  let topo: BoundaryTopology;
  try {
    topo = (await res.json()) as BoundaryTopology;
  } catch {
    throw new Error('The map boundaries file is damaged: it is not valid JSON.');
  }
  return boundariesFromTopology(topo);
}

/**
 * Points that frame the default view, like the reference map: Alaska's west
 * coast to Newfoundland, and the Gulf coast up to the mainland Arctic coast.
 * The high Arctic islands run off the top edge, as they do on the reference.
 */
const FRAME: MultiPoint = {
  type: 'MultiPoint',
  coordinates: [
    [-168.1, 65.6],
    [-52.6, 47.6],
    [-81.8, 24.5],
    [-97.4, 25.8],
    [-125, 70.5],
    [-85, 70],
  ],
};

/** Lambert conformal conic for North America with Alaska in its true place. */
export function mainProjection(width: number, height: number): GeoProjection {
  // A wider left margin leaves the legend over the Pacific, as on the reference.
  const left = width * 0.09;
  const right = width * 0.02;
  const padY = height * 0.04;
  return geoConicConformal()
    .rotate([102, 0])
    .parallels([35, 65])
    .fitExtent(
      [
        [left, padY],
        [width - right, height - padY],
      ],
      FRAME,
    );
}

/** The eight main Hawaiian islands; the small islands to the northwest stay out of the inset. */
const HAWAII_FRAME: MultiPoint = {
  type: 'MultiPoint',
  coordinates: [
    [-160.3, 22.3],
    [-154.8, 18.9],
  ],
};

/** Projection for the Hawaii inset box. */
export function hawaiiProjection(width: number, height: number): GeoProjection {
  return geoConicConformal()
    .rotate([157, 0])
    .parallels([19, 22])
    .fitExtent(
      [
        [8, 8],
        [width - 8, height - 8],
      ],
      HAWAII_FRAME,
    );
}

export function pathFor(projection: GeoProjection) {
  return geoPath(projection);
}
