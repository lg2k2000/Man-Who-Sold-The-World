import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDE_MS, SWITCH_MS, useHover } from '../src/state/hover';

const territoryOf = (code: string) =>
  ['US-WA', 'US-OR'].includes(code) ? 'pacnorthwest' : code === 'US-CA' ? 'southwest' : `region:${code}`;
const point = (code: string, x: number, y: number) => useHover.getState().point(code, x, y, territoryOf);
const card = () => {
  const { code, x, y } = useHover.getState();
  return { code, x, y };
};

describe('the territory card', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useHover.getState().clear();
  });
  afterEach(() => vi.useRealTimers());

  it('appears where the pointer enters and holds still inside the territory', () => {
    point('US-WA', 100, 100);
    expect(card()).toEqual({ code: 'US-WA', x: 100, y: 100 });
    point('US-WA', 160, 140);
    point('US-OR', 150, 220);
    expect(card()).toEqual({ code: 'US-OR', x: 100, y: 100 });
  });

  it('moves to another territory only after the pointer rests there', () => {
    point('US-OR', 100, 100);
    point('US-CA', 120, 300);
    vi.advanceTimersByTime(SWITCH_MS - 50);
    expect(card().code).toBe('US-OR');
    point('US-CA', 130, 310);
    vi.advanceTimersByTime(60);
    expect(card()).toEqual({ code: 'US-CA', x: 130, y: 310 });
  });

  it('keeps its territory when the pointer crosses a neighbour on the way to the card', () => {
    point('US-OR', 100, 100);
    point('US-CA', 120, 300);
    useHover.getState().enterCard();
    vi.advanceTimersByTime(SWITCH_MS * 2);
    expect(card().code).toBe('US-OR');
  });

  it('stays while the pointer is on it and goes after the pointer leaves both', () => {
    point('US-OR', 100, 100);
    useHover.getState().leave();
    useHover.getState().enterCard();
    vi.advanceTimersByTime(HIDE_MS * 3);
    expect(card().code).toBe('US-OR');
    useHover.getState().leaveCard();
    vi.advanceTimersByTime(HIDE_MS - 10);
    expect(card().code).toBe('US-OR');
    vi.advanceTimersByTime(20);
    expect(card().code).toBeNull();
  });

  it('comes back without a gap when the pointer returns to the map in time', () => {
    point('US-OR', 100, 100);
    useHover.getState().leave();
    vi.advanceTimersByTime(HIDE_MS / 2);
    point('US-OR', 110, 110);
    vi.advanceTimersByTime(HIDE_MS);
    expect(card()).toEqual({ code: 'US-OR', x: 100, y: 100 });
  });

  it('hides at once on a click or zoom', () => {
    point('US-OR', 100, 100);
    useHover.getState().clear();
    expect(card().code).toBeNull();
  });
});
