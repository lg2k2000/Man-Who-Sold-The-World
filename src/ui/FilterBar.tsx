import { useMemo } from 'react';
import type { TerritoryConfig } from '../config/territories';
import {
  activeFilterCount,
  CLOSE_WINDOW_LABELS,
  CLOSE_WINDOWS,
  coverageGaps,
  filterCompanies,
  hasOverlap,
  isPinned,
  MY_AREA_ID,
  PIPELINE_STEPS,
  quarterLabel,
  todayLocal,
  type CloseWindow,
  type Filters,
} from '../data/derive';
import { TIER_FITS, TIER_FIT_LABELS, type TierFit } from '../data/types';
import { useApp } from '../state/app';

interface Props {
  config: TerritoryConfig;
  regionNames: Map<string, string>;
}

export function FilterBar({ config, regionNames }: Props) {
  const filters = useApp((s) => s.filters);
  const data = useApp((s) => s.data);
  const index = useApp((s) => s.index);
  const selectedState = useApp((s) => s.selectedState);
  const setFilters = useApp((s) => s.setFilters);
  const clearFilters = useApp((s) => s.clearFilters);
  const focusTerritory = useApp((s) => s.focusTerritory);
  const clearState = useApp((s) => s.clearState);

  const myArea = useApp((s) => s.settings.myArea);
  const matching = useMemo(() => {
    const list = filterCompanies(data, index, config, filters, myArea);
    return selectedState ? list.filter((c) => c.state === selectedState) : list;
  }, [data, index, config, filters, selectedState, myArea]);
  // With no coverage imported, no company can have three roles; the switch says so instead of emptying the map.
  const overlapCount = useMemo(() => data.companies.filter((c) => hasOverlap(index, c.id)).length, [data.companies, index]);
  const gapCount = useMemo(() => {
    const known = data.coverage.length > 0;
    return data.companies.filter((c) => c.type !== 'partner' && coverageGaps(index, c.id, known).length > 0).length;
  }, [data.companies, data.coverage.length, index]);
  const nowQuarter = quarterLabel(todayLocal(), config.fiscal_year_start);
  const areaName =
    filters.territoryId === MY_AREA_ID
      ? 'My area'
      : (config.territories.find((t) => t.id === filters.territoryId)?.name ?? 'this territory');

  const partners = useMemo(
    () => data.companies.filter((c) => c.type === 'partner').sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [data.companies],
  );
  const pinned = useMemo(() => data.companies.filter(isPinned).length, [data.companies]);
  const active = activeFilterCount(filters);

  return (
    <div className="filterbar" role="toolbar" aria-label="Filters">
      <label className="fb-field">
        <span>Territory</span>
        <select aria-label="Territory" value={filters.territoryId ?? ''} onChange={(e) => focusTerritory(e.target.value || null)}>
          <option value="">All of North America</option>
          {myArea.length > 0 && <option value={MY_AREA_ID}>My area</option>}
          {config.territories.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="fb-field">
        <span className="visually-hidden">Tier fit</span>
        <select
          aria-label="Tier fit"
          value={filters.tierFit ?? ''}
          onChange={(e) => setFilters({ tierFit: (e.target.value || null) as TierFit | null })}
        >
          <option value="">Any tier</option>
          {TIER_FITS.map((t) => (
            <option key={t} value={t}>
              {TIER_FIT_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="fb-field">
        <span className="visually-hidden">Partner</span>
        <select
          aria-label="Partner"
          value={filters.partnerId ?? ''}
          onChange={(e) => setFilters({ partnerId: e.target.value || null })}
          disabled={!partners.length}
        >
          <option value="">{partners.length ? 'Any partner' : 'No partners imported'}</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="fb-field">
        <span className="visually-hidden">Deals</span>
        <select aria-label="Deals" value={dealChoice(filters)} onChange={(e) => setFilters(dealFilter(e.target.value))}>
          <option value="any">Any deals</option>
          <option value="yes">Has an open deal</option>
          {PIPELINE_STEPS.map((n) => (
            <option key={n} value={String(n)}>
              Open pipeline ${n / 1000}K or more
            </option>
          ))}
          <option value="no">No open deal</option>
        </select>
      </label>
      <label className="fb-field">
        <span className="visually-hidden">Closing</span>
        <select
          aria-label="Closing"
          value={filters.closeWindow}
          onChange={(e) => setFilters({ closeWindow: e.target.value as CloseWindow | 'any' })}
        >
          <option value="any">Closing any time</option>
          {CLOSE_WINDOWS.map((w) => (
            <option key={w} value={w}>
              {w === 'this-quarter' ? `This quarter (${nowQuarter})` : CLOSE_WINDOW_LABELS[w]}
            </option>
          ))}
        </select>
      </label>
      <label
        className={`fb-toggle${filters.gapsOnly ? ' on' : ''}${gapCount === 0 && !filters.gapsOnly ? ' off' : ''}`}
        title={`Accounts whose open deals have no partner or no primary pipeline owner${data.coverage.length ? ', or with no storage rep' : ''} (${gapCount})`}
      >
        <input
          type="checkbox"
          checked={filters.gapsOnly}
          disabled={gapCount === 0 && !filters.gapsOnly}
          onChange={(e) => setFilters({ gapsOnly: e.target.checked })}
        />
        <span className="gap-key" aria-hidden="true" />
        Coverage gaps
      </label>
      <label
        className={`fb-toggle${filters.overlapOnly ? ' on' : ''}${overlapCount === 0 && !filters.overlapOnly ? ' off' : ''}`}
        title={
          overlapCount === 0
            ? 'No account has people in three or more coverage roles yet. Import coverage (who covers which account) on the Data page to use this.'
            : `Accounts covered by people in three or more account coverage roles, not counting the EAM (${overlapCount})`
        }
      >
        <input
          type="checkbox"
          checked={filters.overlapOnly}
          disabled={overlapCount === 0 && !filters.overlapOnly}
          onChange={(e) => setFilters({ overlapOnly: e.target.checked })}
        />
        <span className="overlap-key" aria-hidden="true" />
        3+ roles
      </label>
      {selectedState && (
        <span className="chip">
          {regionNames.get(selectedState) ?? selectedState}
          <button type="button" aria-label={`Clear ${regionNames.get(selectedState) ?? selectedState}`} onClick={clearState}>
            ×
          </button>
        </span>
      )}
      <span className="fb-spacer" />
      <span className="fb-count" aria-live="polite">
        {pinned === 0
          ? 'No companies on the map'
          : filters.territoryId && !selectedState
            ? `${matching.length} in ${areaName} · ${pinned} on map`
            : `${matching.length} of ${pinned}`}
      </span>
      {active > 0 && (
        <button type="button" className="link" onClick={clearFilters}>
          Clear filters
        </button>
      )}
    </div>
  );
}

/** The deals menu is one choice over two filters: whether there is an open deal, and how big. */
function dealChoice(f: Filters): string {
  return f.minPipeline > 0 ? String(f.minPipeline) : f.openDeal;
}

function dealFilter(value: string): Pick<Filters, 'openDeal' | 'minPipeline'> {
  if (value === 'any' || value === 'yes' || value === 'no') return { openDeal: value, minPipeline: 0 };
  return { openDeal: 'yes', minPipeline: Number(value) };
}
