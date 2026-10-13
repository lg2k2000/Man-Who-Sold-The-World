/** Longest press and farthest move that still count as a click on a region. */
export const CLICK_MAX_MS = 300;
export const CLICK_MAX_PX = 5;

export function isQuickClick(press: { x: number; y: number; t: number } | null, x: number, y: number, t: number): boolean {
  // No pointerdown seen (a synthetic or keyboard click) counts as a click.
  if (!press) return true;
  return t - press.t <= CLICK_MAX_MS && Math.hypot(x - press.x, y - press.y) <= CLICK_MAX_PX;
}
