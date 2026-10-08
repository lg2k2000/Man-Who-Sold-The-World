import { useMemo } from 'react';
import type { TerritoryConfig } from '../config/territories';
import { activeFilterCount, filterCompanies, isPinned } from '../data/derive';
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

  const matching = useMemo(() => {
    const list = filterCompanies(data, index, config, filters);
    return selectedState ? list.filter((c) => c.state === selectedState) : list;
  }, [data, index, config, filters, selectedState]);

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
          {config.territories.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="fb-field">
        <span>Tier fit</span>
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
        <span>Partner</span>
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
        <span>Open deal</span>
        <select
          aria-label="Open deal"
          value={filters.openDeal}
          onChange={(e) => setFilters({ openDeal: e.target.value as 'any' | 'yes' | 'no' })}
        >
          <option value="any">Any</option>
          <option value="yes">Has an open deal</option>
          <option value="no">No open deal</option>
        </select>
      </label>
      <label
        className={`fb-toggle${filters.overlapOnly ? ' on' : ''}`}
        title="Accounts covered by people in three or more account coverage roles, not counting the EAM"
      >
        <input type="checkbox" checked={filters.overlapOnly} onChange={(e) => setFilters({ overlapOnly: e.target.checked })} />
        <span className="overlap-key" aria-hidden="true" />
        3+ coverage roles
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
        {pinned === 0 ? 'No companies on the map' : `${matching.length} of ${pinned} companies`}
      </span>
      {active > 0 && (
        <button type="button" className="link" onClick={clearFilters}>
          Clear filters
        </button>
      )}
    </div>
  );
}
