import { describe, expect, it } from 'vitest';
import { maxRankForZoom, placeCityLabels, placeRegionLabels, type Box, type CityPoint } from '../src/map/labels';

const city = (name: string, x: number, y: number, rank = 1, cap = 0, pop = 1000): CityPoint => ({ name, x, y, rank, cap, pop });

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

describe('maxRankForZoom', () => {
  it('shows more of the smaller places as the zoom grows', () => {
    const ks = [1, 1.5, 2.5, 4, 6, 10, 15, 30];
    const ranks = ks.map(maxRankForZoom);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(maxRankForZoom(1)).toBe(2);
    expect(maxRankForZoom(30)).toBe(11);
  });
});

describe('placeCityLabels', () => {
  it('labels a lone city to the right of its dot', () => {
    expect(placeCityLabels([city('Spokane', 100, 100)], 4)).toEqual([{ city: city('Spokane', 100, 100), side: 'right' }]);
  });

  it('never lets two labels overlap, on a dense random field', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 400;
    const cities = Array.from({ length: 400 }, (_, i) => city(`Town ${i}`, rand(), rand(), i % 4));
    const k = 3;
    const placed = placeCityLabels(cities, k);
    expect(placed.length).toBeGreaterThan(20);
    const boxes = placed.map(({ city: c, side }) => {
      const w = Math.ceil(c.name.length * 6.3) + 4;
      const sx = c.x * k;
      const sy = c.y * k;
      if (side === 'right') return { x0: sx + 8, y0: sy - 6.5, x1: sx + 8 + w, y1: sy + 6.5 };
      if (side === 'left') return { x0: sx - 8 - w, y0: sy - 6.5, x1: sx - 8, y1: sy + 6.5 };
      if (side === 'above') return { x0: sx - w / 2, y0: sy - 18, x1: sx + w / 2, y1: sy - 5 };
      return { x0: sx - w / 2, y0: sy + 5, x1: sx + w / 2, y1: sy + 18 };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
    }
  });

  it('places capitals and prominent cities before smaller neighbors', () => {
    const placed = placeCityLabels([city('Suburb', 100.5, 100, 1, 0, 90000), city('Capital', 100, 100, 3, 1, 50000)], 1.5);
    expect(placed.map((p) => p.city.name)).toEqual(['Capital']);
  });

  it('holds back small towns until the viewer zooms in', () => {
    const towns = [city('Metro', 10, 10, 0), city('Town', 60, 60, 9)];
    expect(placeCityLabels(towns, 1).map((p) => p.city.name)).toEqual(['Metro']);
    expect(placeCityLabels(towns, 10).map((p) => p.city.name)).toEqual(['Metro', 'Town']);
  });

  it('skips cities outside the view box', () => {
    const view = { x0: 0, y0: 0, x1: 200, y1: 200 };
    const placed = placeCityLabels([city('In', 50, 50), city('Out', 500, 50)], 1, [], { view });
    expect(placed.map((p) => p.city.name)).toEqual(['In']);
  });

  it('moves a label off a pin when another side is clear, and keeps it when none is', () => {
    const pinRight = { x0: 20, y0: 95, x1: 40, y1: 105 };
    expect(placeCityLabels([city('A', 10, 100)], 1, [], { obstacles: [pinRight] })[0]!.side).toBe('left');
    const ring = [pinRight, { x0: -60, y0: 95, x1: 0, y1: 105 }, { x0: 0, y0: 80, x1: 20, y1: 90 }, { x0: 0, y0: 110, x1: 20, y1: 120 }];
    expect(placeCityLabels([city('A', 10, 100)], 1, [], { obstacles: ring })[0]!.side).toBe('right');
  });

  it('keeps cities clear of reserved boxes', () => {
    expect(placeCityLabels([city('Under', 100, 100)], 1, [{ x0: 90, y0: 90, x1: 110, y1: 110 }])).toEqual([]);
  });
});

describe('placeRegionLabels', () => {
  const wa = { code: 'US-WA', name: 'Washington', x: 100, y: 100, width: 60 };
  const ri = { code: 'US-RI', name: 'Rhode Island', x: 300, y: 300, width: 4 };

  it('shows nothing at continent zoom', () => {
    expect(placeRegionLabels([wa], 1)).toEqual([]);
  });

  it('uses the full name when it fits, the postal code when only that fits, and nothing when neither does', () => {
    expect(placeRegionLabels([wa], 1.4)[0]!.text).toBe('WA');
    expect(placeRegionLabels([wa], 4)[0]!.text).toBe('WASHINGTON');
    expect(placeRegionLabels([ri], 4)).toEqual([]);
    expect(placeRegionLabels([ri], 8)[0]!.text).toBe('RI');
  });

  it('gives way to a wider neighbor instead of overlapping or moving around it', () => {
    const neighbor = { code: 'US-XX', name: 'Small', x: 101, y: 100, width: 30 };
    expect(placeRegionLabels([neighbor, wa], 4).map((r) => r.code)).toEqual(['US-WA']);
  });

  it('moves off a count badge at the center', () => {
    const badge = { x0: 387, y0: 387, x1: 413, y1: 413 };
    const [label] = placeRegionLabels([wa], 4, 1.35, { obstacles: [badge] });
    expect(label!.dy).toBe(-22);
  });
});
