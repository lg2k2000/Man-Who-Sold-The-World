import { create } from 'zustand';

/** The region under the pointer, kept apart from app state so mouse moves only redraw the card. */
interface HoverState {
  code: string | null;
  x: number;
  y: number;
  set(code: string | null, x?: number, y?: number): void;
}

export const useHover = create<HoverState>((set) => ({
  code: null,
  x: 0,
  y: 0,
  set(code, x = 0, y = 0) {
    set({ code, x, y });
  },
}));
