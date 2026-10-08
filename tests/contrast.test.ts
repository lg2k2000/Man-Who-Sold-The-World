import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import rawConfig from '../config/territories.json';

// Reads the color tokens from styles.css and checks them against WCAG 2.2:
// 4.5:1 for body text, 3:1 for large text, focus rings, and the shapes the
// map draws against its background.

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No ${selector} block in styles.css`);
  const body = css.slice(start, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const light = block(':root');
const dark = { ...light, ...block(":root[data-theme='dark']") };

function resolve(tokens: Record<string, string>, name: string): string {
  let v = tokens[name];
  for (let i = 0; v && v.startsWith('var(') && i < 5; i++) v = tokens[v.slice(6, -1)];
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`--${name} is not a plain hex color: ${v}`);
  return v;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ['text', 'surface'],
  ['text', 'page'],
  ['muted', 'surface'],
  ['muted', 'page'],
  ['chrome-fg', 'chrome-bg'],
  ['warn-fg', 'warn-bg'],
  ['conf-confirmed', 'surface'],
  ['conf-reported', 'surface'],
  ['conf-inferred', 'surface'],
  ['badge-text', 'badge-fill'],
];

const SHAPE_PAIRS: [string, string][] = [
  ['focus', 'surface'],
  ['focus', 'page'],
  ['coast', 'map-water'],
  ['outline', 'map-water'],
];

for (const [themeName, tokens] of [
  ['light', light],
  ['dark', dark],
] as const) {
  describe(`${themeName} theme contrast`, () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      it(`--${fg} on --${bg} reaches 4.5:1 for text`, () => {
        expect(contrast(resolve(tokens, fg), resolve(tokens, bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [fg, bg] of SHAPE_PAIRS) {
      it(`--${fg} against --${bg} reaches 3:1`, () => {
        expect(contrast(resolve(tokens, fg), resolve(tokens, bg))).toBeGreaterThanOrEqual(3);
      });
    }
    it('every territory has a pin color that reaches 3:1 on its fill', () => {
      const pinFill = resolve(tokens, 'pin-fill');
      const pinStroke = resolve(tokens, 'pin-stroke');
      for (const t of rawConfig.territories) {
        const best = Math.max(contrast(pinFill, t.color), contrast(pinStroke, t.color));
        expect({ territory: t.name, ok: best >= 3 }).toEqual({ territory: t.name, ok: true });
      }
    });
  });
}

describe('chrome colors', () => {
  it('white on HPE navy reaches 4.5:1, and white on HPE green does not, so green never carries white text', () => {
    expect(contrast('#ffffff', '#425563')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', '#01a982')).toBeLessThan(4.5);
    expect(contrast('#10231d', '#01a982')).toBeGreaterThanOrEqual(4.5);
  });
});
