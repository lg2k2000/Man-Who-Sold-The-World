import { useEffect, useRef, useState } from 'react';
import type { TerritoryConfig } from '../config/territories';
import { useApp, type ThemeSetting, type View } from '../state/app';
import { Search } from './Search';

interface Props {
  config: TerritoryConfig;
  homeId: string;
}

const NAV: { view: View; label: string }[] = [
  { view: 'map', label: 'Map' },
  { view: 'data', label: 'Data' },
];

export function Header({ config, homeId }: Props) {
  const focusTerritory = useApp((s) => s.focusTerritory);
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const home = config.territories.find((t) => t.id === homeId);

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M7 22 L13 9 L19 18 L22 14 L26 22 Z" fill="currentColor" />
        </svg>
        <h1>{config.fiscal_year} Territory Coverage</h1>
      </div>
      <nav className="views" aria-label="Views">
        {NAV.map((n) => (
          <button key={n.view} type="button" className={view === n.view ? 'on' : ''} aria-current={view === n.view ? 'page' : undefined} onClick={() => setView(n.view)}>
            {n.label}
          </button>
        ))}
      </nav>
      <Search />
      <div className="controls">
        {view === 'map' && (
          <>
            <button type="button" className="btn" onClick={() => focusTerritory(homeId)} disabled={!home} title={home ? `Frame ${home.name}` : undefined}>
              My territory
            </button>
            <button type="button" className="btn" onClick={() => focusTerritory(null)}>
              North America
            </button>
          </>
        )}
        <SettingsMenu config={config} homeId={homeId} />
      </div>
    </header>
  );
}

function SettingsMenu({ config, homeId }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const theme = useApp((s) => s.settings.theme);
  const setTheme = useApp((s) => s.setTheme);
  const setHome = useApp((s) => s.setHomeTerritory);

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

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn icon" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} title="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2.1-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
          />
        </svg>
        <span className="visually-hidden">Settings</span>
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Settings">
          <label className="field">
            <span>My territory</span>
            <select value={homeId} onChange={(e) => setHome(e.target.value)}>
              {config.territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="field">
            <legend>Theme</legend>
            <div className="segmented">
              {(['system', 'light', 'dark'] as ThemeSetting[]).map((v) => (
                <label key={v} className={theme === v ? 'on' : ''}>
                  <input type="radio" name="theme" value={v} checked={theme === v} onChange={() => setTheme(v)} />
                  {v[0]!.toUpperCase() + v.slice(1)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
