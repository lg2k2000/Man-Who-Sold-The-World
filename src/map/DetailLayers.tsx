import { memo, useMemo } from 'react';
import { geoPath, type GeoPath, type GeoPermissibleObjects, type GeoProjection } from 'd3-geo';
import type { FeatureCollection, MultiLineString } from 'geojson';
import type { Detail, LayerSettings } from './detail';
import { SHOW_AT } from './detail';
import { placeCityLabels, placeRegionLabels, type Box, type CityPoint, type RegionLabelInput } from './labels';

interface UnderProps {
  detail: Detail;
  projection: GeoProjection;
  layers: LayerSettings;
  k: number;
}

/** Tile size, in projected pixels at zoom 1, for splitting a layer into separate paths. */
const TILE = 60;

/**
 * Draws a layer as one path per tile instead of one path for the continent,
 * so the browser skips the tiles outside the view when it repaints during a
 * pan or zoom. Each shape goes in the tile that holds the center of its bounds.
 */
function tiled(shapes: GeoPermissibleObjects[], path: GeoPath): string[] {
  const tiles = new Map<string, GeoPermissibleObjects[]>();
  for (const shape of shapes) {
    const [[x0, y0], [x1, y1]] = path.bounds(shape);
    if (!Number.isFinite(x0)) continue;
    const key = `${Math.floor((x0 + x1) / 2 / TILE)},${Math.floor((y0 + y1) / 2 / TILE)}`;
    const list = tiles.get(key);
    if (list) list.push(shape);
    else tiles.set(key, [shape]);
  }
  return [...tiles.values()].map((list) => list.map((shape) => path(shape) ?? '').join(''));
}

const features = (fc: FeatureCollection) => fc.features as GeoPermissibleObjects[];
const lines = (m: MultiLineString) => m.coordinates.map((coordinates) => ({ type: 'LineString', coordinates }) as GeoPermissibleObjects);

/**
 * Detail drawn over the territory fills and under the hatch, borders, and
 * pins: metro areas, water, county lines, and highways. Nothing here takes
 * the pointer, so hovering and clicking still reach the regions.
 */
export const DetailUnder = memo(function DetailUnder({ detail, projection, layers, k }: UnderProps) {
  const d = useMemo(() => {
    const path = geoPath(projection);
    return {
      urban: tiled(features(detail.urban), path),
      lakes: tiled(features(detail.lakes), path),
      majorRivers: tiled(features(detail.majorRivers), path),
      minorRivers: tiled(features(detail.minorRivers), path),
      majorRoads: tiled(features(detail.majorRoads), path),
      minorRoads: tiled(features(detail.minorRoads), path),
    };
  }, [detail, projection]);
  // County lines are thousands of segments; build them only once someone zooms in far enough to see them.
  const showCounties = layers.counties && k >= SHOW_AT.counties;
  const counties = useMemo(
    () => (showCounties ? tiled(lines(detail.countyLines), geoPath(projection)) : []),
    [showCounties, detail, projection],
  );

  const draw = (className: string, tiles: string[]) => tiles.map((t, i) => <path key={`${className}-${i}`} className={className} d={t} />);
  return (
    <g className="detail" aria-hidden="true">
      {layers.metro && draw('d-urban', d.urban)}
      {layers.water && (
        <>
          {draw('d-lake', d.lakes)}
          {draw('d-river', d.majorRivers)}
          {k >= SHOW_AT.minorRivers && draw('d-river minor', d.minorRivers)}
        </>
      )}
      {showCounties && draw('d-county', counties)}
      {layers.highways && (
        <>
          {k >= SHOW_AT.minorRoads && draw('d-road minor', d.minorRoads)}
          {k >= SHOW_AT.roadCasing && draw('d-road-casing', d.majorRoads)}
          {draw('d-road major', d.majorRoads)}
        </>
      )}
    </g>
  );
});

interface LabelProps {
  detail: Detail;
  projection: GeoProjection;
  layers: LayerSettings;
  k: number;
  /** The area worth labeling, in zoom-scaled layer coordinates. */
  view: Box;
  /** Pins and count badges, in the same coordinates; labels keep clear of them. */
  obstacles: Box[];
  regions: RegionLabelInput[];
}

/** City dots and names, and state and province names, placed so none overlap at the current zoom. */
export const DetailLabels = memo(function DetailLabels({ detail, projection, layers, k, view, obstacles, regions }: LabelProps) {
  const cities = useMemo<CityPoint[]>(
    () =>
      detail.cities.features.flatMap((f) => {
        const xy = projection(f.geometry.coordinates as [number, number]);
        return xy ? [{ ...f.properties, x: xy[0], y: xy[1] }] : [];
      }),
    [detail, projection],
  );
  const regionLabels = useMemo(
    () => (layers.regionNames ? placeRegionLabels(regions, k, 1.35, { view, obstacles }) : []),
    [layers.regionNames, regions, k, view, obstacles],
  );
  const placed = useMemo(
    () =>
      layers.cities
        ? placeCityLabels(
            cities,
            k,
            regionLabels.map((r) => r.box),
            { view, obstacles },
          )
        : [],
    [layers.cities, cities, k, regionLabels, view, obstacles],
  );

  return (
    <g className="detail-labels" aria-hidden="true">
      {regionLabels.map((r) => (
        <g key={r.code} transform={`translate(${r.x},${r.y})`}>
          <text className="region-label" dy={r.dy}>
            {r.text}
          </text>
        </g>
      ))}
      {placed.map(({ city, side }) => (
        <g key={`${city.name}@${city.x.toFixed(1)},${city.y.toFixed(1)}`} transform={`translate(${city.x},${city.y})`}>
          <g className={`city${city.cap ? ' capital' : ''}`}>
            <circle r={city.cap ? 3.4 : 2.6} />
            {city.cap > 0 && <circle className="cap-ring" r={5.2} />}
            <text {...TEXT_AT[side]}>{city.name}</text>
          </g>
        </g>
      ))}
    </g>
  );
});

/** Where a city's name sits for each side placeCityLabels picks, in screen pixels from the dot. */
const TEXT_AT = {
  right: { x: 10, dy: '0.35em', textAnchor: 'start' },
  left: { x: -10, dy: '0.35em', textAnchor: 'end' },
  above: { y: -8, textAnchor: 'middle' },
  below: { y: 15, textAnchor: 'middle' },
} as const;
