import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { search, type SearchHit } from '../data/derive';
import { useApp } from '../state/app';

const KIND_LABEL: Record<SearchHit['kind'], string> = { prospect: 'Prospect', person: 'HPE', partner: 'Partner' };

/** Finds any person, partner, or prospect by name and jumps to it. "/" focuses it. */
export function Search() {
  const data = useApp((s) => s.data);
  const openProspect = useApp((s) => s.openProspect);
  const openPerson = useApp((s) => s.openPerson);
  const openPartner = useApp((s) => s.openPartner);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const hits = useMemo(() => search(data, query), [data, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const choose = (hit: SearchHit) => {
    if (hit.kind === 'prospect') openProspect(hit.id);
    else if (hit.kind === 'person') openPerson(hit.id);
    else openPartner(hit.id);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className="search">
      <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        placeholder="Search people, partners, prospects"
        value={query}
        role="combobox"
        aria-label="Search people, partners, and prospects"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            choose(hits[active]);
          } else if (e.key === 'Escape') {
            setQuery('');
            setOpen(false);
          }
        }}
      />
      <kbd className="search-kbd" aria-hidden="true">/</kbd>
      {showList && (
        <ul className="search-list" role="listbox" id={listId}>
          {hits.length === 0 && <li className="search-empty">No person, partner, or prospect matches "{query.trim()}".</li>}
          {hits.map((h, i) => (
            <li
              key={`${h.kind}:${h.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={`kind kind-${h.kind}`}>{KIND_LABEL[h.kind]}</span>
              <span className="hit-label">{h.label}</span>
              <span className="hit-detail">{h.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
