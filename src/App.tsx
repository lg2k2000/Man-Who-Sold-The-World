import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { config, regionIndex } from './config';
import { loadBoundaries, type Boundaries } from './map/geo';
import { MapView } from './map/MapView';
import { HawaiiInset } from './map/HawaiiInset';
import { Header } from './ui/Header';
import { FilterBar } from './ui/FilterBar';
import { Legend } from './ui/Legend';
import { SampleBanner } from './ui/SampleBanner';
import { SidePanel } from './ui/SidePanel';
import { TerritoryCard } from './ui/TerritoryCard';
import { useApp } from './state/app';

const LEGEND_WIDTH = 340;
const PANEL_WIDTH = 440;

export function App() {
  const [boundaries, setBoundaries] = useState<Boundaries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const theme = useApp((s) => s.settings.theme);
  const savedHome = useApp((s) => s.settings.homeTerritoryId);
  const focusId = useApp((s) => s.focusTerritoryId);
  const focusTerritory = useApp((s) => s.focusTerritory);
  const people = useApp((s) => s.data.people);
  const hasSample = useApp((s) => s.hasSample);
  const panelOpen = useApp((s) => s.panel !== null);

  const homeId = savedHome && config.territories.some((t) => t.id === savedHome) ? savedHome : config.default_focus;

  const regionNames = useMemo(
    () => new Map((boundaries?.regions ?? []).map((r) => [r.properties.code, r.properties.name])),
    [boundaries],
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    loadBoundaries().then(setBoundaries, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Open on the viewer's own territory.
  useEffect(() => {
    focusTerritory(homeId);
    // Only on first load; later changes to the setting do not move the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="app">
      <Header config={config} homeId={homeId} />
      {hasSample && <SampleBanner />}
      <FilterBar config={config} regionNames={regionNames} />
      <main className="stage" ref={stageRef}>
        {error && (
          <div className="map-error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn solid" onClick={() => location.reload()}>
              Try again
            </button>
          </div>
        )}
        {!boundaries && !error && <div className="map-loading">Loading map</div>}
        {boundaries && (
          <>
            <MapView
              boundaries={boundaries}
              config={config}
              index={regionIndex}
              insets={{ left: LEGEND_WIDTH + 16, right: panelOpen ? PANEL_WIDTH : 0 }}
            />
            <div className="overlay-left" style={{ width: LEGEND_WIDTH }}>
              <Legend config={config} people={people} focusId={focusId} onSelect={(id) => focusTerritory(id)} />
            </div>
            <div className="overlay-inset" style={{ left: LEGEND_WIDTH + 28 }}>
              <HawaiiInset boundaries={boundaries} index={regionIndex} />
            </div>
            <TerritoryCard config={config} index={regionIndex} regionNames={regionNames} stage={stage} />
          </>
        )}
        <SidePanel regionNames={regionNames} />
      </main>
    </div>
  );
}
