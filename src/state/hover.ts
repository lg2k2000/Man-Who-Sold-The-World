import { create } from 'zustand';

/**
 * The territory card's place and subject, kept apart from app state so mouse
 * moves only redraw the card.
 *
 * The card holds still so it can be read and clicked: it appears where the
 * pointer enters a territory and keeps that spot while the pointer moves
 * anywhere in the same territory. It moves to another territory only after the
 * pointer rests there for SWITCH_MS, so crossing a neighbour on the way to the
 * card does not swap it. It stays while the pointer is over it, and goes
 * HIDE_MS after the pointer leaves both the map and the card.
 */
export const SWITCH_MS = 250;
export const HIDE_MS = 300;

interface HoverState {
  /** The region the card describes, or null when no card shows. */
  code: string | null;
  /** Where the card is anchored, in map pixels. */
  x: number;
  y: number;
  overCard: boolean;
  /** The pointer is over a region; `territoryOf` says which territory a region belongs to. */
  point(code: string, x: number, y: number, territoryOf: (code: string) => string): void;
  /** Shows the card for a region at once, for keyboard focus. */
  show(code: string, x: number, y: number): void;
  /** The pointer left the map: the card goes soon unless the pointer reaches it. */
  leave(): void;
  enterCard(): void;
  leaveCard(): void;
  /** Hides the card now: a click, a zoom, or Escape. */
  clear(): void;
}

let switchTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { code: string; x: number; y: number; territory: string } | null = null;
let shownTerritory: string | null = null;

function stopSwitch() {
  if (switchTimer) clearTimeout(switchTimer);
  switchTimer = null;
  pending = null;
}

function stopHide() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
}

export const useHover = create<HoverState>((set, get) => ({
  code: null,
  x: 0,
  y: 0,
  overCard: false,

  point(code, x, y, territoryOf) {
    stopHide();
    if (get().overCard) return;
    const territory = territoryOf(code);
    if (get().code === null) {
      stopSwitch();
      shownTerritory = territory;
      set({ code, x, y });
      return;
    }
    if (territory === shownTerritory) {
      // Same territory: name the state under the pointer, keep the card where it is.
      stopSwitch();
      if (get().code !== code) set({ code });
      return;
    }
    if (pending?.territory === territory) {
      pending = { code, x, y, territory };
      return;
    }
    stopSwitch();
    pending = { code, x, y, territory };
    switchTimer = setTimeout(() => {
      const p = pending;
      switchTimer = null;
      pending = null;
      if (!p || get().overCard) return;
      shownTerritory = p.territory;
      set({ code: p.code, x: p.x, y: p.y });
    }, SWITCH_MS);
  },

  show(code, x, y) {
    stopHide();
    stopSwitch();
    shownTerritory = null;
    set({ code, x, y, overCard: false });
  },

  leave() {
    stopSwitch();
    if (get().overCard || get().code === null) return;
    stopHide();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!get().overCard) {
        shownTerritory = null;
        set({ code: null });
      }
    }, HIDE_MS);
  },

  enterCard() {
    stopHide();
    stopSwitch();
    set({ overCard: true });
  },

  leaveCard() {
    set({ overCard: false });
    get().leave();
  },

  clear() {
    stopHide();
    stopSwitch();
    shownTerritory = null;
    set({ code: null, overCard: false });
  },
}));
