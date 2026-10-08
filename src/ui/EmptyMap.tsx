import { useState } from 'react';
import { useApp } from '../state/app';

/** Said on the map when nothing is imported, so the empty map reads as intentional. */
export function EmptyMap() {
  const data = useApp((s) => s.data);
  const setView = useApp((s) => s.setView);
  const [hidden, setHidden] = useState(false);
  if (data.prospects.length > 0 || hidden) return null;
  const missing = [
    data.people.length === 0 && 'people',
    data.partners.length === 0 && 'partners',
    'prospects',
  ].filter(Boolean) as string[];
  return (
    <div className="notice empty-map" role="status">
      <div>
        <strong>No prospects to pin yet.</strong> The map shows territories from the config. Import {joinList(missing)} in Data to fill the cards and
        pins, or load the sample data to look around.
      </div>
      <button type="button" className="btn solid small" onClick={() => setView('data')}>
        Open Data
      </button>
      <button type="button" className="icon-btn" aria-label="Hide this message" onClick={() => setHidden(true)}>
        ×
      </button>
    </div>
  );
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
