import { create } from 'zustand';
import { emptyDataset, hasSampleRows, type Dataset } from '../data/types';
import type { DataStore } from '../data/store';

export type ThemeSetting = 'system' | 'light' | 'dark';

const SETTINGS_KEY = 'tc.settings.v1';

interface Settings {
  /** The viewer's own territory; the map opens focused on it. Null means the config default. */
  homeTerritoryId: string | null;
  theme: ThemeSetting;
}

function readSettings(): Settings {
  const fallback: Settings = { homeTerritoryId: null, theme: 'system' };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      homeTerritoryId: typeof parsed.homeTerritoryId === 'string' ? parsed.homeTerritoryId : null,
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'system',
    };
  } catch {
    return fallback;
  }
}

function writeSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: settings last for this visit only.
  }
}

interface AppState {
  settings: Settings;
  /** Territory the map is focused on, or null for all of North America. */
  focusTerritoryId: string | null;
  /** Bumped on every focus request so repeating the same request re-zooms. */
  focusRequest: number;
  data: Dataset;
  hasSample: boolean;
  store: DataStore | null;

  setHomeTerritory(id: string | null): void;
  setTheme(theme: ThemeSetting): void;
  focusTerritory(id: string | null): void;
  attachStore(store: DataStore): Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  settings: readSettings(),
  focusTerritoryId: null,
  focusRequest: 0,
  data: emptyDataset(),
  hasSample: false,
  store: null,

  setHomeTerritory(id) {
    const settings = { ...get().settings, homeTerritoryId: id };
    writeSettings(settings);
    set({ settings });
  },
  setTheme(theme) {
    const settings = { ...get().settings, theme };
    writeSettings(settings);
    set({ settings });
  },
  focusTerritory(id) {
    set((s) => ({ focusTerritoryId: id, focusRequest: s.focusRequest + 1 }));
  },
  async attachStore(store) {
    const data = await store.load();
    set({ store, data, hasSample: hasSampleRows(data) });
  },
}));
