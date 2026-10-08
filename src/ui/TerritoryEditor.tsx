import { useMemo } from 'react';
import { create } from 'zustand';
import { committedConfig } from '../config';
import { diffConfigs, moveRegion, serializeConfig, setConfirmed, setLegendCount } from '../config/editor';
import { countWarnings } from '../config/territories';
import { useApp } from '../state/app';
import { downloadText } from './download';

/** The region whose editor is open, and where on the map it was clicked. */
export const useEditTarget = create<{
  code: string | null;
  x: number;
  y: number;
  open(code: string, x: number, y: number): void;
  close(): void;
}>((set) => ({
  code: null,
  x: 0,
  y: 0,
  open: (code, x, y) => set({ code, x, y }),
  close: () => set({ code: null }),
}));

function exportConfig() {
  const cfg = useApp.getState().config;
  downloadText('territories.json', serializeConfig(cfg));
}

/** The bar across the top of the map while editing territories. */
export function EditBar({ regionNames }: { regionNames: Map<string, string> }) {
  const config = useApp((s) => s.config);
  const updateConfig = useApp((s) => s.updateConfig);
  const discardDraft = useApp((s) => s.discardDraft);
  const setEditing = useApp((s) => s.setEditingTerritories);
  const close = useEditTarget((s) => s.close);
  const changes = useMemo(() => diffConfigs(committedConfig, config), [config]);
  const warnings = useMemo(() => countWarnings(config), [config]);
  const name = (id: string | null) => (id ? (config.territories.find((t) => t.id === id)?.name ?? id) : 'unassigned');

  return (
    <div className="editbar" role="region" aria-label="Territory editor">
      <div className="editbar-main">
        <strong>Editing territories</strong>
        <span className="muted">
          Click a state or province to move it or confirm it. Changes stay a draft in this browser until you export.
        </span>
        <span className="editbar-spacer" />
        <button type="button" className="btn solid" onClick={exportConfig}>
          Export territories.json
        </button>
        <button
          type="button"
          className="btn"
          disabled={changes.length === 0}
          onClick={() => {
            if (
              window.confirm(`Discard ${changes.length} change${changes.length === 1 ? '' : 's'} and go back to the committed territories?`)
            ) {
              close();
              discardDraft();
            }
          }}
        >
          Discard draft
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            close();
            setEditing(false);
          }}
        >
          Done
        </button>
      </div>
      <div className="editbar-detail">
        <div>
          <h3>Count warnings</h3>
          {warnings.length === 0 ? (
            <p className="muted small">Every territory's member count matches its legend count.</p>
          ) : (
            <ul className="plain">
              {warnings.map((w) => (
                <li key={w.territoryId} className="warn-line">
                  <span className="warn-dot" aria-hidden="true" />
                  {name(w.territoryId)} has {w.members} member{w.members === 1 ? '' : 's'}; the legend says
                  <input
                    type="number"
                    min={0}
                    className="count-input"
                    aria-label={`Legend count for ${name(w.territoryId)}`}
                    value={w.legendCount}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isInteger(n) && n >= 0) updateConfig(setLegendCount(config, w.territoryId, n));
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Changes in this draft ({changes.length})</h3>
          {changes.length === 0 ? (
            <p className="muted small">No changes from config/territories.json yet.</p>
          ) : (
            <ul className="plain small">
              {changes.map((c) => (
                <li key={c.code}>
                  {regionNames.get(c.code) ?? c.code}:{' '}
                  {c.from !== c.to ? `${name(c.from)} to ${name(c.to)}` : c.confirmedAfter ? 'confirmed' : 'marked unconfirmed'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** The small form that opens where a region was clicked in edit mode. */
export function RegionEditor({ regionNames, stage }: { regionNames: Map<string, string>; stage: { w: number; h: number } }) {
  const target = useEditTarget();
  const config = useApp((s) => s.config);
  const regionIndex = useApp((s) => s.regionIndex);
  const updateConfig = useApp((s) => s.updateConfig);
  if (!target.code) return null;
  const code = target.code;
  const a = regionIndex.get(code);
  const W = 280;
  const left = Math.min(Math.max(8, target.x + 12), stage.w - W - 8);
  const place = target.y < stage.h / 2 ? { top: target.y + 12 } : { bottom: stage.h - target.y + 12 };
  const committed = committedConfig.territories.find((t) => t.members.some((m) => m.code === code));

  return (
    <div className="region-editor" style={{ left, width: W, ...place }} role="dialog" aria-label={`Edit ${regionNames.get(code) ?? code}`}>
      <div className="re-head">
        <strong>{regionNames.get(code) ?? code}</strong>
        <span className="muted mono">{code}</span>
        <button type="button" className="icon-btn" onClick={target.close} aria-label="Close editor">
          ×
        </button>
      </div>
      <label className="field">
        <span>Territory</span>
        <select autoFocus value={a?.territory.id ?? ''} onChange={(e) => updateConfig(moveRegion(config, code, e.target.value || null))}>
          <option value="">Unassigned</option>
          {config.territories.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          disabled={!a}
          checked={a?.confirmed ?? false}
          onChange={(e) => updateConfig(setConfirmed(config, code, e.target.checked))}
        />
        Confirmed
      </label>
      <p className="muted small">Committed file: {committed ? committed.name : 'unassigned'}.</p>
    </div>
  );
}

/** Shown on the map when a draft is in use but the editor is closed, or when the draft is out of date. */
export function DraftNotice() {
  const status = useApp((s) => s.draftStatus);
  const editing = useApp((s) => s.editingTerritories);
  const config = useApp((s) => s.config);
  const setEditing = useApp((s) => s.setEditingTerritories);
  const discardDraft = useApp((s) => s.discardDraft);
  const acceptStaleDraft = useApp((s) => s.acceptStaleDraft);
  const changes = useMemo(() => diffConfigs(committedConfig, config).length, [config]);

  if (status === 'stale') {
    return (
      <div className="notice warn" role="alert">
        config/territories.json changed since you started your territory draft. The map shows your draft.
        <button type="button" className="btn small" onClick={acceptStaleDraft}>
          Keep my draft
        </button>
        <button type="button" className="btn small" onClick={discardDraft}>
          Use the new file
        </button>
      </div>
    );
  }
  if (status === 'invalid') {
    return (
      <div className="notice warn" role="alert">
        A saved territory draft could not be read, so the map shows config/territories.json.
        <button type="button" className="btn small" onClick={discardDraft}>
          Dismiss
        </button>
      </div>
    );
  }
  if (status === 'draft' && !editing && changes > 0) {
    return (
      <div className="notice" role="status">
        The map shows your territory draft ({changes} change{changes === 1 ? '' : 's'}), not yet exported.
        <button type="button" className="btn small" onClick={() => setEditing(true)}>
          Open editor
        </button>
        <button type="button" className="btn small" onClick={exportConfig}>
          Export
        </button>
      </div>
    );
  }
  return null;
}
