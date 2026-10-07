import { create } from 'zustand';
import { emptyDataset, hasSampleRows, type Dataset } from '../data/types';
import { indexDataset, NO_FILTERS, type DataIndex, type Filters } from '../data/derive';
import type { DataStore } from '../data/store';
import { territoryIdOf } from '../config';

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

/** What the map should frame on the next frame request. */
export type FrameTarget =
  | { kind: 'all' }
  | { kind: 'territory'; id: string }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'point'; code: string; lng: number | null; lat: number | null };

export type Panel = { kind: 'prospect' | 'person' | 'partner'; id: string } | null;

interface AppState {
  settings: Settings;
  /** Territory in focus: the map dims the rest and pins are limited to it. Null means all. */
  focusTerritoryId: string | null;
  /** State or province the viewer selected; pins are limited to it. */
  selectedState: string | null;
  /** Regions outlined for a person or partner from search. */
  highlightCodes: string[] | null;
  frame: FrameTarget;
  /** Bumped on every frame request so repeating the same request re-frames. */
  frameRequest: number;
  filters: Filters;
  panel: Panel;
  data: Dataset;
  index: DataIndex;
  hasSample: boolean;
  store: DataStore | null;

  setHomeTerritory(id: string | null): void;
  setTheme(theme: ThemeSetting): void;
  focusTerritory(id: string | null): void;
  selectState(code: string, territoryId: string | null): void;
  clearState(): void;
  setFilters(patch: Partial<Filters>): void;
  clearFilters(): void;
  openProspect(id: string): void;
  openPerson(email: string): void;
  openPartner(id: string): void;
  closePanel(): void;
  attachStore(store: DataStore): Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  settings: readSettings(),
  focusTerritoryId: null,
  selectedState: null,
  highlightCodes: null,
  frame: { kind: 'all' },
  frameRequest: 0,
  filters: NO_FILTERS,
  panel: null,
  data: emptyDataset(),
  index: indexDataset(emptyDataset()),
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
    set((s) => ({
      focusTerritoryId: id,
      selectedState: null,
      highlightCodes: null,
      filters: { ...s.filters, territoryId: id },
      frame: id ? { kind: 'territory', id } : { kind: 'all' },
      frameRequest: s.frameRequest + 1,
    }));
  },
  selectState(code, territoryId) {
    set((s) => ({
      focusTerritoryId: territoryId,
      selectedState: code,
      highlightCodes: null,
      filters: { ...s.filters, territoryId },
      frame: { kind: 'codes', codes: [code] },
      frameRequest: s.frameRequest + 1,
    }));
  },
  clearState() {
    const id = get().focusTerritoryId;
    set((s) => ({
      selectedState: null,
      frame: id ? { kind: 'territory', id } : { kind: 'all' },
      frameRequest: s.frameRequest + 1,
    }));
  },
  setFilters(patch) {
    set((s) => ({ filters: { ...s.filters, ...patch } }));
  },
  clearFilters() {
    set((s) => ({ filters: { ...NO_FILTERS, territoryId: s.filters.territoryId } }));
  },
  openProspect(id) {
    const p = get().index.prospectById.get(id);
    if (!p) return;
    const territoryId = territoryIdOf(p.state);
    set((s) => ({
      panel: { kind: 'prospect', id },
      focusTerritoryId: territoryId,
      filters: { ...s.filters, territoryId },
      selectedState: p.state,
      highlightCodes: null,
      frame: { kind: 'point', code: p.state, lng: p.lng, lat: p.lat },
      frameRequest: s.frameRequest + 1,
    }));
  },
  openPerson(email) {
    const p = get().index.personByEmail.get(email);
    if (!p) return;
    set((s) => ({
      panel: { kind: 'person', id: email },
      focusTerritoryId: null,
      filters: { ...s.filters, territoryId: null },
      selectedState: null,
      highlightCodes: p.states,
      frame: p.states.length ? { kind: 'codes', codes: p.states } : s.frame,
      frameRequest: s.frameRequest + (p.states.length ? 1 : 0),
    }));
  },
  openPartner(id) {
    const p = get().index.partnerById.get(id);
    if (!p) return;
    set((s) => ({
      panel: { kind: 'partner', id },
      focusTerritoryId: null,
      filters: { ...s.filters, territoryId: null },
      selectedState: null,
      highlightCodes: p.states,
      frame: p.states.length ? { kind: 'codes', codes: p.states } : s.frame,
      frameRequest: s.frameRequest + (p.states.length ? 1 : 0),
    }));
  },
  closePanel() {
    set({ panel: null, highlightCodes: null });
  },
  async attachStore(store) {
    const data = await store.load();
    set({ store, data, index: indexDataset(data), hasSample: hasSampleRows(data) });
  },
}));
