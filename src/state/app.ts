import { create } from 'zustand';
import { emptyDataset, hasSampleRows, TABLES, type Dataset, type TableName } from '../data/types';
import { indexDataset, NO_FILTERS, type DataIndex, type Filters } from '../data/derive';
import type { DataStore } from '../data/store';
import { committedConfig } from '../config';
import { buildRegionIndex, territoryConfigSchema, type RegionAssignment, type TerritoryConfig } from '../config/territories';
import { configHash } from '../config/editor';
import { DEFAULT_LAYERS, readLayers, type LayerSettings } from '../map/detail';
import { applySnapshot, markSnapshotApplied, shouldAutoApply, type Snapshot } from '../import/snapshot';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type View = 'map' | 'deals' | 'companies' | 'contacts' | 'team' | 'data';
export const VIEWS: View[] = ['map', 'deals', 'companies', 'contacts', 'team', 'data'];

const SETTINGS_KEY = 'tc.settings.v1';
const DRAFT_KEY = 'tc.territoryDraft.v1';

interface Settings {
  /** The viewer's own territory; the map opens focused on it. Null means the config default. */
  homeTerritoryId: string | null;
  theme: ThemeSetting;
  /** Name written to updated_by when the viewer edits a record. */
  editorName: string;
  /** Which detail layers the map draws. */
  layers: LayerSettings;
}

function readSettings(): Settings {
  const fallback: Settings = { homeTerritoryId: null, theme: 'system', editorName: '', layers: { ...DEFAULT_LAYERS } };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      homeTerritoryId: typeof parsed.homeTerritoryId === 'string' ? parsed.homeTerritoryId : null,
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'system',
      editorName: typeof parsed.editorName === 'string' ? parsed.editorName : '',
      layers: readLayers(parsed.layers),
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

export type CompanyTab = 'Brief' | 'Contacts' | 'Coverage' | 'Deals';
export type Panel = { kind: 'company'; id: string; tab?: CompanyTab } | { kind: 'person'; id: string } | null;
export type EditTarget = { kind: 'person' | 'company' | 'contact' | 'deal'; id: string } | null;

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
  /** A record to open in its edit form when its view shows. */
  editRecord: EditTarget;

  data: Dataset;
  index: DataIndex;
  hasSample: boolean;
  store: DataStore | null;
  /** Set when storage failed; the app keeps working in memory and says so. */
  storeProblem: StoreProblem | null;
  /** Data published next to this copy of the app, if any, and what became of it. */
  snapshot: { snap: Snapshot; loadedNow: boolean } | null;

  setHomeTerritory(id: string | null): void;
  setTheme(theme: ThemeSetting): void;
  setEditorName(name: string): void;
  setLayers(layers: LayerSettings): void;
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
  /** Shows a company on the map with its panel open; a partner shows the states it works in. */
  openCompany(id: string, tab?: CompanyTab): void;
  openPerson(id: string): void;
  closePanel(): void;
  editPerson(id: string | null): void;
  editCompany(id: string | null): void;
  editContact(id: string | null): void;
  editDeal(id: string | null): void;

  attachStore(store: DataStore, problem?: StoreProblem | null): Promise<void>;
  /**
   * Takes the snapshot published next to the app. A browser that never loaded
   * it and holds no real rows loads it now; any other browser keeps its data,
   * and the Data page offers the snapshot.
   */
  offerSnapshot(snap: Snapshot): Promise<void>;
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
  editRecord: null,

  ...withData(emptyDataset()),
  store: null,
  storeProblem: null,
  snapshot: null,

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
  setLayers(layers) {
    const settings = { ...get().settings, layers };
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
  openCompany(id, tab) {
    const c = get().index.companyById.get(id);
    if (!c) return;
    if (c.type === 'partner' || !c.state) {
      // A partner, or a company with no location, frames the states it works in, if any.
      set((s) => ({
        view: 'map',
        panel: { kind: 'company', id, tab },
        focusTerritoryId: null,
        filters: { ...s.filters, territoryId: null },
        selectedState: null,
        highlightCodes: c.states.length ? c.states : null,
        frame: c.states.length ? { kind: 'codes', codes: c.states } : s.frame,
        frameRequest: s.frameRequest + (c.states.length ? 1 : 0),
      }));
      return;
    }
    const territoryId = get().regionIndex.get(c.state)?.territory.id ?? null;
    set((s) => ({
      view: 'map',
      panel: { kind: 'company', id, tab },
      focusTerritoryId: territoryId,
      filters: { ...s.filters, territoryId },
      selectedState: c.state,
      highlightCodes: null,
      frame: { kind: 'point', code: c.state!, lng: c.lng, lat: c.lat },
      frameRequest: s.frameRequest + 1,
    }));
  },
  openPerson(id) {
    const p = get().index.personById.get(id);
    if (!p) return;
    set((s) => ({
      view: 'map',
      panel: { kind: 'person', id },
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
  editPerson(id) {
    set({ view: 'team', editRecord: id === null ? null : { kind: 'person', id } });
  },
  editCompany(id) {
    set({ view: 'companies', editRecord: id === null ? null : { kind: 'company', id } });
  },
  editContact(id) {
    set({ view: 'contacts', editRecord: id === null ? null : { kind: 'contact', id } });
  },
  editDeal(id) {
    set({ view: 'deals', editRecord: id === null ? null : { kind: 'deal', id } });
  },

  async attachStore(store, problem = null) {
    const data = await store.load();
    set({ store, storeProblem: problem, ...withData(data) });
  },
  async offerSnapshot(snap) {
    if (!shouldAutoApply(get().data, snap)) {
      set({ snapshot: { snap, loadedNow: false } });
      return;
    }
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { data } = applySnapshot(get().data, snap, get().config, today);
    await get().saveAll(data);
    markSnapshotApplied(snap.id);
    set({ snapshot: { snap, loadedNow: true } });
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
