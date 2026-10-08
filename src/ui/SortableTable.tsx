import { useMemo, useState, type ReactNode } from 'react';
import { sortRows, type SortDir } from '../data/edit';

export interface Column<T> {
  id: string;
  label: string;
  /** What the column sorts by. Omit to make the column unsortable. */
  sort?: (row: T) => string | number | null;
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onOpen: (row: T) => void;
  initialSort: { id: string; dir: SortDir };
  empty: ReactNode;
  selectedKey?: string | null;
}

/** A table whose headers sort it. Enter or a click on a row opens it. */
export function SortableTable<T>({ caption, columns, rows, rowKey, onOpen, initialSort, empty, selectedKey }: Props<T>) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.id === sort.id);
    return col?.sort ? sortRows(rows, col.sort, sort.dir) : rows;
  }, [rows, columns, sort]);

  if (rows.length === 0) return <div className="table-empty">{empty}</div>;

  return (
    <table className="records">
      <caption className="visually-hidden">{caption}, sorted by {columns.find((c) => c.id === sort.id)?.label} {sort.dir === 'asc' ? 'ascending' : 'descending'}</caption>
      <thead>
        <tr>
          {columns.map((c) => {
            const active = sort.id === c.id;
            return (
              <th key={c.id} scope="col" className={c.className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sort ? (
                  <button
                    type="button"
                    className={`sort${active ? ' on' : ''}`}
                    onClick={() => setSort({ id: c.id, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
                  >
                    {c.label}
                    <span className="sort-arrow" aria-hidden="true">
                      {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                ) : (
                  c.label
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => {
          const key = rowKey(row);
          return (
            <tr
              key={key}
              className={key === selectedKey ? 'selected' : ''}
              tabIndex={0}
              onClick={() => onOpen(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen(row);
                }
              }}
            >
              {columns.map((c) => (
                <td key={c.id} className={c.className}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
