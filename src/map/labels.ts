// Chooses which city and region labels to draw at a zoom level so that no two
// labels overlap. Pure functions on projected coordinates, so they are tested
// without a browser.

export interface CityPoint {
  name: string;
  pop: number;
  /** 0 is the most prominent; Natural Earth places run 0 to 8 and added towns 9 to 11. */
  rank: number;
  /** 2 for a national capital, 1 for a state or provincial capital, 0 otherwise. */
  cap: number;
  /** Projected position at zoom 1. */
  x: number;
  y: number;
}

export interface PlacedCity {
  city: CityPoint;
  side: 'right' | 'left' | 'above' | 'below';
}

/** A rectangle in zoom-scaled layer coordinates (screen pixels, before panning). */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PlaceOptions {
  /** Labels and dots outside this box are skipped. */
  view?: Box;
  /**
   * Pins and count badges. A label moves to a side clear of them when it can;
   * when no side is clear it keeps its first free side and the pin draws over it.
   */
  obstacles?: Box[];
}

/** The least prominent rank shown at a zoom level: big metros first, small towns last. */
export function maxRankForZoom(k: number): number {
  if (k < 1.3) return 2;
  if (k < 2) return 3;
  if (k < 3.5) return 4;
  if (k < 5) return 6;
  if (k < 8) return 8;
  if (k < 13) return 9;
  if (k < 20) return 10;
  return 11;
}

/** Rough label width in screen pixels for an 11px system font. */
export function labelWidth(text: string, charWidth = 6.3): number {
  return Math.ceil(text.length * charWidth) + 4;
}

const LABEL_H = 13;
/** Room between a city dot and its name; wide enough that a pin sitting on the dot leaves the name clear. */
const GAP = 8;
const CELL = 64;

/** A spatial hash of placed boxes, so each new label checks only its neighbors. */
class BoxGrid {
  private cells = new Map<string, Box[]>();

  private keys(b: Box): string[] {
    const out: string[] = [];
    for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++) {
      for (let cy = Math.floor(b.y0 / CELL); cy <= Math.floor(b.y1 / CELL); cy++) out.push(`${cx},${cy}`);
    }
    return out;
  }

  hits(b: Box): boolean {
    for (const key of this.keys(b)) {
      for (const o of this.cells.get(key) ?? []) {
        if (b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) return true;
      }
    }
    return false;
  }

  add(b: Box) {
    for (const key of this.keys(b)) {
      const list = this.cells.get(key);
      if (list) list.push(b);
      else this.cells.set(key, [b]);
    }
  }
}

function inView(x: number, y: number, view: Box | undefined): boolean {
  return !view || (x >= view.x0 && x <= view.x1 && y >= view.y0 && y <= view.y1);
}

function gridOf(boxes: Box[]): BoxGrid {
  const grid = new BoxGrid();
  for (const b of boxes) grid.add(b);
  return grid;
}

/**
 * Picks the cities to label at zoom `k`. Capitals and prominent cities go
 * first. Each label sits right of its dot, else left, above, or below,
 * preferring a side clear of obstacles; a city whose label overlaps another
 * label on every side is left out with its dot. `reserved` boxes (region
 * labels) are kept clear of both dots and labels.
 */
export function placeCityLabels(cities: CityPoint[], k: number, reserved: Box[] = [], options: PlaceOptions = {}): PlacedCity[] {
  const maxRank = maxRankForZoom(k);
  const grid = gridOf(reserved);
  const obstacles = gridOf(options.obstacles ?? []);
  const order = cities
    .filter((c) => (c.rank <= maxRank || (c.cap > 0 && c.rank <= maxRank + 2)) && inView(c.x * k, c.y * k, options.view))
    .sort((a, b) => b.cap - a.cap || a.rank - b.rank || b.pop - a.pop || a.name.localeCompare(b.name));
  const placed: PlacedCity[] = [];
  for (const city of order) {
    const sx = city.x * k;
    const sy = city.y * k;
    const w = labelWidth(city.name);
    const dot: Box = { x0: sx - 3, y0: sy - 3, x1: sx + 3, y1: sy + 3 };
    if (grid.hits(dot)) continue;
    const candidates: [PlacedCity['side'], Box][] = [
      ['right', { x0: sx + GAP, y0: sy - LABEL_H / 2, x1: sx + GAP + w, y1: sy + LABEL_H / 2 }],
      ['left', { x0: sx - GAP - w, y0: sy - LABEL_H / 2, x1: sx - GAP, y1: sy + LABEL_H / 2 }],
      ['above', { x0: sx - w / 2, y0: sy - 5 - LABEL_H, x1: sx + w / 2, y1: sy - 5 }],
      ['below', { x0: sx - w / 2, y0: sy + 5, x1: sx + w / 2, y1: sy + 5 + LABEL_H }],
    ];
    const free = candidates.filter(([, box]) => !grid.hits(box));
    const fit = free.find(([, box]) => !obstacles.hits(box)) ?? free[0];
    if (!fit) continue;
    grid.add(dot);
    grid.add(fit[1]);
    placed.push({ city, side: fit[0] });
  }
  return placed;
}

export interface RegionLabelInput {
  code: string;
  name: string;
  /** Projected center and width at zoom 1. */
  x: number;
  y: number;
  width: number;
}

export interface PlacedRegionLabel {
  code: string;
  text: string;
  x: number;
  y: number;
  /** Screen pixels the label moved off center to clear a pin or count badge. */
  dy: number;
  box: Box;
}

/** Off-center positions tried, in screen pixels, when a pin or count badge sits on a region's center. */
const REGION_OFFSETS = [0, -22, 22];

/**
 * State and province names, shown from zoom `minK` on. A region too narrow
 * for its name gets its postal abbreviation, and one too narrow for that gets
 * no label, as does one whose centered label would overlap a wider
 * neighbor's. A label moves above or below center to clear obstacles when it can.
 */
export function placeRegionLabels(regions: RegionLabelInput[], k: number, minK = 1.35, options: PlaceOptions = {}): PlacedRegionLabel[] {
  if (k < minK) return [];
  const grid = new BoxGrid();
  const obstacles = gridOf(options.obstacles ?? []);
  const out: PlacedRegionLabel[] = [];
  // Wide regions first, so a small neighbor gives way rather than a large one.
  for (const r of [...regions].sort((a, b) => b.width - a.width || a.code.localeCompare(b.code))) {
    if (!inView(r.x * k, r.y * k, options.view)) continue;
    const span = r.width * k;
    const full = r.name.toUpperCase();
    const text = span > labelWidth(full, 7.4) + 8 ? full : span > 26 ? r.code.slice(3) : null;
    if (!text) continue;
    const w = labelWidth(text, 7.4);
    const sx = r.x * k;
    const centered = { x0: sx - w / 2, y0: r.y * k - 8, x1: sx + w / 2, y1: r.y * k + 8 };
    if (grid.hits(centered)) continue;
    const free = REGION_OFFSETS.map((dy) => {
      const sy = r.y * k + dy;
      return { dy, box: { x0: sx - w / 2, y0: sy - 8, x1: sx + w / 2, y1: sy + 8 } };
    }).filter((c) => !grid.hits(c.box));
    const fit = free.find((c) => !obstacles.hits(c.box)) ?? free[0];
    if (!fit) continue;
    grid.add(fit.box);
    out.push({ code: r.code, text, x: r.x, y: r.y, dy: fit.dy, box: fit.box });
  }
  return out;
}
