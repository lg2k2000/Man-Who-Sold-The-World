import { describe, expect, it } from 'vitest';
import { CLICK_MAX_MS, CLICK_MAX_PX, isQuickClick } from '../src/map/click';

describe('isQuickClick', () => {
  const down = { x: 100, y: 100, t: 1000 };
  it('accepts a short, still press', () => {
    expect(isQuickClick(down, 101, 101, 1000 + 120)).toBe(true);
  });
  it('rejects a press held longer than the limit', () => {
    expect(isQuickClick(down, 100, 100, 1000 + CLICK_MAX_MS + 1)).toBe(false);
  });
  it('rejects a press that moved', () => {
    expect(isQuickClick(down, 100 + CLICK_MAX_PX + 1, 100, 1050)).toBe(false);
  });
  it('accepts a click with no pointerdown', () => {
    expect(isQuickClick(null, 0, 0, 0)).toBe(true);
  });
});
