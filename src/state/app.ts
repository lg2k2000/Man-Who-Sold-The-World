import { create } from 'zustand';
import { emptyDataset, hasSampleRows, TABLES, type Dataset, type TableName } from '../data/types';
import { indexDataset, NO_FILTERS, type DataIndex, type Filters } from '../data/derive';
import type { DataStore } from '../data/store';
import { committedConfig } from '../config';
import { buildRegionIndex, territoryConfigSchema, type RegionAssignment, type TerritoryConfig } from '../config/territories';
import { configHash } from '../config/editor';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type View = 'map' | 'data' | 'people' | 'partners';

const SETTINGS_KEY = 'tc.settings.v1';
const DRAFT_KEY = 'tc.territoryDraft.v1';

interface Settings {
  /** The viewer's own territory; the map opens focused on it. Null means the config default. */
  homeTerritoryId: string | null;
  theme: ThemeSetting;
  /** Name written to updated_by when the viewer edits a record. */
  editorName: string;
}

function readSettings(): Settings {
  const fallback: Settings = { homeTerritoryId: null, theme: 'system', editorName: '' };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      homeTerritoryId: typeof parsed.homeTerritoryId === 'string' ? parsed.homeTerritoryId : null,
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'system',
      editorName: typeof parsed.editorName === 'string' ? parsed.editorName : '',
    };
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the value lasts for this visit only.
  }
}

interface StoredDraft {
  baseHash: string;
  config: TerritoryConfig;
}

export type DraftStatus = 'none' | 'draft' | 'stale' | 'invalid';

/** A territory draft saved in this browser, checked against the committed config. */
function readDraft(): { config: TerritoryConfig; status: DraftStatus } {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return { config: committedConfig, status: 'none' };
    const stored = JSON.parse(raw) as StoredDraft;
    const parsed = territoryConfigSchema.safeParse(stored.config);
    if (!parsed.success) return { config: committedConfig, status: 'invalid' };
    return { config: parsed.data, status: stored.baseHash === configHash(committedConfig) ? 'draft' : 'stale' };
  } catch {
    return { config: committedConfig, status: 'none' };
  }
}

/** What the map should frame on the next frame request. */
export type FrameTarget =
  | { kind: 'all' }
  | { kind: 'territory'; id: string }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'point'; code: string; lng: number | null; lat: number | null };

export type Panel = { kind: 'prospect' | 'person' | 'partner'; id: string } | null;

export interface StoreProblem {
  message: string;
}

interface AppState {
  settings: Settings;
  view: View;

  /** The config the app draws: the committed file, or the viewer's draft of it. */
  config: TerritoryConfig;
  regionIndex: Map<string, RegionAssignment>;
  draftStatus: DraftStatus;
  editingTerritories: boolean;

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
  /** Set when storage failed; the app keeps working in memory and says so. */
  storeProblem: StoreProblem | null;

  setHomeTerritory(id: string | null): void;
  setTheme(theme: ThemeSetting): void;
  setEditorName(name: string): void;
  setView(view: View): void;

  setEditingTerritories(on: boolean): void;
  updateConfig(next: TerritoryConfig): void;
  discardDraft(): void;
  acceptStaleDraft(): void;

  focusTerritory(id: string | null): void;
  selectState(code: string, territoryId: string | null): void;
  clearState(): void;
  setFilters(patch: Partial<Filters>): void;
  clearFilters(): void;
  openProspect(id: string): void;
  openPerson(email: string): void;
  openPartner(id: string): void;
  closePanel(): void;

  attachStore(store: DataStore, problem?: StoreProblem | null): Promise<void>;
  /** Saves one table and refreshes everything derived from the data. */
  saveTable<T extends TableName>(table: T, rows: Dataset[T]): Promise<void>;
  saveAll(data: Dataset): Promise<void>;
}

const initialDraft = readDraft();

function withData(data: Dataset) {
  return { data, index: indexDataset(data), hasSample: hasSampleRows(data) };
}

export const useApp = create<AppState>((set, get) => ({
  settings: readSettings(),
  view: 'map',

  config: initialDraft.config,
  regionIndex: buildRegionIndex(initialDraft.config),
  draftStatus: initialDraft.status,
  editingTerritories: false,

  focusTerritoryId: null,
  selectedState: null,
  highlightCodes: null,
  frame: { kind: 'all' },
  frameRequest: 0,
  filters: NO_FILTERS,
  panel: null,

  ...withData(emptyDataset()),
  store: null,
  storeProblem: null,

  setHomeTerritory(id) {
    const settings = { ...get().settings, homeTerritoryId: id };
    writeLocal(SETTINGS_KEY, settings);
    set({ settings });
  },
  setTheme(theme) {
    const settings = { ...get().settings, theme };
    writeLocal(SETTINGS_KEY, settings);
    set({ settings });
  },
  setEditorName(editorName) {
    const settings = { ...get().settings, editorName };
    writeLocal(SETTINGS_KEY, settings);
    set({ settings });
  },
  setView(view) {
    set({ view });
  },

  setEditingTerritories(on) {
    set({ editingTerritories: on, panel: on ? null : get().panel });
  },
  updateConfig(next) {
    const same = configHash(next) === configHash(committedConfig);
    writeLocal(DRAFT_KEY, same ? null : ({ baseHash: configHash(committedConfig), config: next } satisfies StoredDraft));
    set({ config: next, regionIndex: buildRegionIndex(next), draftStatus: same ? 'none' : 'draft' });
  },
  discardDraft() {
    writeLocal(DRAFT_KEY, null);
    set({ config: committedConfig, regionIndex: buildRegionIndex(committedConfig), draftStatus: 'none' });
  },
  acceptStaleDraft() {
    // Keep the viewer's draft, now measured against the new committed file.
    get().updateConfig(get().config);
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
    const territoryId = get().regionIndex.get(p.state)?.territory.id ?? null;
    set((s) => ({
      view: 'map',
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
      view: 'map',
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
      view: 'map',
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

  async attachStore(store, problem = null) {
    const data = await store.load();
    set({ store, storeProblem: problem, ...withData(data) });
  },
  async saveTable(table, rows) {
    const store = get().store;
    if (!store) throw new Error('Storage is not ready yet.');
    await store.replaceTable(table, rows);
    const data = { ...get().data, [table]: rows };
    set(withData(data));
  },
  async saveAll(data) {
    const store = get().store;
    if (!store) throw new Error('Storage is not ready yet.');
    await store.replaceAll(data);
    set(withData(data));
  },
}));

/** Rows that are not sample rows, table by table. */
export function withoutSample(d: Dataset): Dataset {
  const out = emptyDataset();
  for (const t of TABLES) (out as Record<TableName, unknown[]>)[t] = (d[t] as { is_sample?: boolean }[]).filter((r) => !r.is_sample);
  return out;
}
