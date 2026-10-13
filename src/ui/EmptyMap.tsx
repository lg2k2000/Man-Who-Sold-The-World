import { useState } from 'react';
import { useApp } from '../state/app';

/** Said on the map when nothing is imported, so the empty map reads as intentional. */
export function EmptyMap() {
  const data = useApp((s) => s.data);
  const setView = useApp((s) => s.setView);
  const [hidden, setHidden] = useState(false);
  const pinnable = data.companies.filter((c) => c.type !== 'partner');
  if (pinnable.some((c) => c.state) || hidden) return null;
  const unplaced = pinnable.length;
  return (
    <div className="notice empty-map" role="status">
      {unplaced > 0 ? (
        <div>
          <strong>
            {unplaced} compan{unplaced === 1 ? 'y has' : 'ies have'} no state yet.
          </strong>{' '}
          A company gets a pin once it has a state or province. Add one in Companies, or import a companies sheet with a state column.
        </div>
      ) : (
        <div>
          <strong>No companies to pin yet.</strong> The map shows territories from the config. Import a deal spreadsheet, companies, or the
          HPE team in Data to fill the cards and pins, or load the sample data to look around.
        </div>
      )}
      <button type="button" className="btn solid small" onClick={() => setView('data')}>
        Open Data
      </button>
      <button type="button" className="icon-btn" aria-label="Hide this message" onClick={() => setHidden(true)}>
        ×
      </button>
    </div>
  );
}
