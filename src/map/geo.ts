import { geoConicConformal, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry, MultiPoint } from 'geojson';
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
}

export const HAWAII = 'US-HI';
export const GEO_URL = `${import.meta.env.BASE_URL}geo/north-america.topo.json`;

type BoundaryTopology = Topology<{
  regions: GeometryCollection<RegionProps>;
  countries: GeometryCollection<CountryProps>;
}>;

export function boundariesFromTopology(topo: BoundaryTopology): Boundaries {
  const regions = feature(topo, topo.objects.regions) as FeatureCollection<Geometry, RegionProps>;
  const countries = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, CountryProps>;
  return { regions: regions.features, countries: countries.features };
}

export async function loadBoundaries(url = GEO_URL): Promise<Boundaries> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Map boundaries failed to load (HTTP ${res.status}).`);
  return boundariesFromTopology((await res.json()) as BoundaryTopology);
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
