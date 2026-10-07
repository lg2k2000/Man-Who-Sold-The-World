import type { GeoPath } from 'd3-geo';
import type { Feature, Geometry, MultiPolygon } from 'geojson';

export type Bounds = [[number, number], [number, number]];

/**
 * Projected bounds of a feature without its small outlying islands, so that
 * focusing on Alaska frames the mainland instead of the whole Aleutian chain.
 * A polygon counts when its area is at least `minShare` of the largest one.
 */
export function mainBounds(f: Feature<Geometry>, path: GeoPath, minShare = 0.02): Bounds {
  if (f.geometry.type !== 'MultiPolygon') return path.bounds(f) as Bounds;
  const parts = (f.geometry as MultiPolygon).coordinates.map((coordinates) => {
    const part: Feature<Geometry> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } };
    return { part, area: path.area(part) };
  });
  const largest = Math.max(...parts.map((p) => p.area));
  const kept = parts.filter((p) => p.area >= largest * minShare).map((p) => path.bounds(p.part) as Bounds);
  return unionBounds(kept);
}

export function unionBounds(list: Bounds[]): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [[a, b], [c, d]] of list) {
    x0 = Math.min(x0, a);
    y0 = Math.min(y0, b);
    x1 = Math.max(x1, c);
    y1 = Math.max(y1, d);
  }
  return [
    [x0, y0],
    [x1, y1],
  ];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Scale and translation that fit `b` inside `box`, capped at `maxScale`. */
export function fitTransform(b: Bounds, box: Box, maxScale: number, fill = 0.92) {
  const [[bx0, by0], [bx1, by1]] = b;
  const bw = Math.max(bx1 - bx0, 1e-6);
  const bh = Math.max(by1 - by0, 1e-6);
  const k = Math.min(maxScale, fill * Math.min((box.x1 - box.x0) / bw, (box.y1 - box.y0) / bh));
  const x = (box.x0 + box.x1) / 2 - (k * (bx0 + bx1)) / 2;
  const y = (box.y0 + box.y1) / 2 - (k * (by0 + by1)) / 2;
  return { k, x, y };
}
