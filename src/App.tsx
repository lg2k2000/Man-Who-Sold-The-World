import { useEffect, useMemo, useState } from 'react';
import rawConfig from '../config/territories.json';
import { buildRegionIndex, parseTerritoryConfig } from './config/territories';
import { loadBoundaries, type Boundaries } from './map/geo';
import { MapView } from './map/MapView';
import { HawaiiInset } from './map/HawaiiInset';
import { Header } from './ui/Header';
import { Legend } from './ui/Legend';
import { SampleBanner } from './ui/SampleBanner';
import { useApp } from './state/app';

const config = parseTerritoryConfig(rawConfig);
const LEGEND_WIDTH = 340;

export function App() {
  const index = useMemo(() => buildRegionIndex(config), []);
  const [boundaries, setBoundaries] = useState<Boundaries | null>(null);
  const [error, setError] = useState<string | null>(null);

  const theme = useApp((s) => s.settings.theme);
  const savedHome = useApp((s) => s.settings.homeTerritoryId);
  const focusId = useApp((s) => s.focusTerritoryId);
  const focusRequest = useApp((s) => s.focusRequest);
  const focusTerritory = useApp((s) => s.focusTerritory);
  const people = useApp((s) => s.data.people);
  const hasSample = useApp((s) => s.hasSample);

  const homeId = savedHome && config.territories.some((t) => t.id === savedHome) ? savedHome : config.default_focus;

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

  return (
    <div className="app">
      <Header config={config} homeId={homeId} />
      {hasSample && <SampleBanner />}
      <main className="stage">
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
              index={index}
              focusId={focusId}
              focusRequest={focusRequest}
              insets={{ left: LEGEND_WIDTH + 16 }}
            />
            <div className="overlay-left" style={{ width: LEGEND_WIDTH }}>
              <Legend config={config} people={people} focusId={focusId} onSelect={(id) => focusTerritory(id)} />
            </div>
            <div className="overlay-inset" style={{ left: LEGEND_WIDTH + 28 }}>
              <HawaiiInset boundaries={boundaries} index={index} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
