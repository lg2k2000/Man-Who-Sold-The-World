import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/app';
import { LAYER_HINTS, LAYER_LABELS, type LayerSettings } from '../map/detail';

export type DetailStatus = 'loading' | 'ready' | 'failed';

/** The map's layer switches, opened from the button above the zoom controls. */
export function LayersMenu({ status }: { status: DetailStatus }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const layers = useApp((s) => s.settings.layers);
  const setLayers = useApp((s) => s.setLayers);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const keys = Object.keys(LAYER_LABELS) as (keyof LayerSettings)[];
  return (
    <div className="menu layers-menu" ref={ref}>
      <button
        type="button"
        className="btn icon"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Map layers"
        title="Map layers"
        onClick={() => setOpen(!open)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="m12 3 10 5.5-10 5.5L2 8.5 12 3Zm-7.4 9.3L12 16.4l7.4-4.1 2.6 1.4-10 5.5-10-5.5 2.6-1.4Z" />
        </svg>
      </button>
      {open && (
        <div className="popover layers-popover" role="dialog" aria-label="Map layers">
          <fieldset className="field">
            <legend>Map layers</legend>
            {keys.map((key) => (
              <label key={key} className="check">
                <input type="checkbox" checked={layers[key]} onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })} />
                <span>
                  {LAYER_LABELS[key]}
                  {LAYER_HINTS[key] && <small>{LAYER_HINTS[key]}</small>}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="layers-note">Map data: Natural Earth, US Census Bureau, and GeoNames (CC BY 4.0).</p>
          {status === 'loading' && <p className="layers-note">Map detail is still loading.</p>}
          {status === 'failed' && (
            <p className="layers-note" role="alert">
              Map detail did not load. Territories, pins, and data still work; reload the page to try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
