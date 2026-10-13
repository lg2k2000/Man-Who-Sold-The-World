import { useEffect, useMemo, useRef, useState } from 'react';
import { TABLES, type TableName } from '../data/types';
import { describeStorageError, requestPersistence } from '../data/idb';
import {
  autoMap,
  guessTable,
  guessTableFromHeaders,
  importSource,
  layoutKey,
  missingRequired,
  readDelimited,
  readFile,
  tabulate,
  type ImportReport,
  type Mapping,
  type Source,
} from '../import/importer';
import { columnLabel, COLUMNS, JSON_ONLY, TABLE_LABELS } from '../import/tables';
import { text } from '../import/fields';
import { useApp } from '../state/app';
import { today } from './forms';

const MAPPINGS_KEY = 'tc.mappings.v1';

function readMappings(): Record<string, Mapping> {
  try {
    return JSON.parse(localStorage.getItem(MAPPINGS_KEY) ?? '{}') as Record<string, Mapping>;
  } catch {
    return {};
  }
}

function rememberMapping(key: string, mapping: Mapping) {
  try {
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify({ ...readMappings(), [key]: mapping }));
  } catch {
    // Storage blocked: the matching is not remembered, and the import still works.
  }
}

/** Order files so the records others point at come first. */
const TABLE_ORDER: TableName[] = ['people', 'companies', 'contacts', 'deals', 'coverage', 'briefs'];

interface Pending {
  file?: File;
  source: Source;
}

/** Choose a file or paste rows, match columns, preview, then import. */
export function ImportPanel({ busy, onReports }: { busy: boolean; onReports(reports: ImportReport[]): void }) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const choose = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    const list = [...files];
    // Read each file against the table its name suggests; the wizard lets the owner change it.
    const read = await Promise.all(list.map(async (file) => ({ file, source: await readFile(file, guessTable(file.name) ?? 'deals') })));
    read.sort((a, b) => TABLE_ORDER.indexOf(guessTable(a.file.name) ?? 'deals') - TABLE_ORDER.indexOf(guessTable(b.file.name) ?? 'deals'));
    setQueue(read);
    setReading(false);
    onReports([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const readPasted = () => {
    const source = readDelimited(pasted, 'pasted rows');
    setQueue([{ source }]);
    setPasting(false);
    setPasted('');
    onReports([]);
  };

  const current = queue[0];
  return (
    <section className="card">
      <h3>Import a spreadsheet</h3>
      <p className="muted small">
        Excel workbooks (.xlsx), CSV, and JSON files, or rows pasted straight from a spreadsheet. The app matches the columns by their
        names; you check the matching and see what will change before anything is saved. An import adds and updates rows and never blanks a
        field that already has a value.
      </p>
      {!current && (
        <div className="import-row">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json"
            multiple
            className="visually-hidden"
            id="import-file"
            onChange={(e) => void choose(e.target.files)}
            disabled={busy || reading}
          />
          <label htmlFor="import-file" className="btn solid">
            {reading ? 'Reading…' : 'Choose files'}
          </label>
          <button type="button" className="btn" onClick={() => setPasting(!pasting)} aria-expanded={pasting}>
            Paste rows
          </button>
        </div>
      )}
      {!current && pasting && (
        <div className="paste-box">
          <label htmlFor="paste-rows" className="small">
            Copy the rows in Excel or Google Sheets, header row included, and paste them here.
          </label>
          <textarea
            id="paste-rows"
            className="text-input mono"
            rows={8}
            value={pasted}
            placeholder={'Opportunity ID\tAccount Name\tStage\tAmount\nOPE-0000000001\tSample Co 1\tQualify\t$250,000'}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="btn-row">
            <button type="button" className="btn solid" onClick={readPasted} disabled={!pasted.trim()}>
              Read pasted rows
            </button>
            <button type="button" className="btn" onClick={() => setPasting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {current && (
        <Wizard
          key={`${current.source.fileName}:${queue.length}`}
          pending={current}
          remaining={queue.length - 1}
          busy={busy}
          onDone={(report) => {
            onReports(report ? [report] : []);
            setQueue(queue.slice(1));
          }}
          onCancel={() => setQueue([])}
        />
      )}
    </section>
  );
}

function Wizard({
  pending,
  remaining,
  busy,
  onDone,
  onCancel,
}: {
  pending: Pending;
  remaining: number;
  busy: boolean;
  onDone(report: ImportReport | null): void;
  onCancel(): void;
}) {
  const { source } = pending;
  const config = useApp((s) => s.config);
  const data = useApp((s) => s.data);
  const saveAll = useApp((s) => s.saveAll);

  const sheets = source.kind === 'sheets' ? source.sheets : [];
  // The first sheet with data under a header.
  const [sheetIndex, setSheetIndex] = useState(() =>
    Math.max(
      0,
      sheets.findIndex((s) => tabulate(s).rows.length > 0),
    ),
  );
  const sheet = sheets[sheetIndex];
  const [headerRow, setHeaderRow] = useState<number | null>(null);
  const tab = useMemo(() => (sheet ? tabulate(sheet, headerRow ?? undefined) : null), [sheet, headerRow]);

  const guessed: TableName =
    guessTable(source.fileName) ?? (sheet ? guessTable(sheet.name) : null) ?? (tab ? guessTableFromHeaders(tab.headers) : 'deals');
  const [table, setTable] = useState<TableName>(source.kind === 'json' ? (guessTable(source.fileName) ?? 'briefs') : guessed);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = tab ? layoutKey(table, tab.headers) : '';
  const [mapping, setMapping] = useState<Mapping>([]);
  const [remembered, setRemembered] = useState(false);
  useEffect(() => {
    if (!tab) return;
    const saved = readMappings()[key];
    const usable = saved && saved.length === tab.headers.length;
    setMapping(usable ? saved : autoMap(table, tab));
    setRemembered(!!usable);
  }, [key, tab, table]);

  const result = useMemo(() => {
    if (source.kind === 'error') return null;
    if (source.kind === 'sheets' && (!tab || mapping.length !== tab.headers.length)) return null;
    return importSource(
      table,
      source,
      data,
      config,
      { replace, today: today() },
      source.kind === 'sheets' ? mapping : undefined,
      sheetIndex,
      tab?.headerRow,
    );
  }, [source, tab, mapping, table, data, config, replace, sheetIndex]);

  const missing = tab ? missingRequired(table, mapping) : [];
  const report = result?.report;
  const changes = report ? report.added + report.updated : 0;
  const tableOptions = TABLES.filter((t) => source.kind === 'json' || !JSON_ONLY.has(t));

  const commit = async () => {
    if (!result?.data || !report) return;
    try {
      await saveAll(result.data);
      if (tab) rememberMapping(key, mapping);
      void requestPersistence();
      onDone(report);
    } catch (e) {
      setError(`Saving failed: ${describeStorageError(e)} Nothing was changed.`);
    }
  };

  if (source.kind === 'error') {
    return (
      <div className="wizard">
        <p className="callout warn">
          <strong>{source.fileName}</strong>: {source.error}
        </p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => (remaining ? onDone(null) : onCancel())}>
            {remaining ? `Skip to the next file (${remaining} left)` : 'Close'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard">
      <div className="wizard-head">
        <strong className="mono">{source.fileName}</strong>
        {remaining > 0 && <span className="muted small">then {remaining} more</span>}
      </div>
      <div className="wizard-row">
        <label className="fb-field">
          <span>Import into</span>
          <select aria-label="Import into" value={table} onChange={(e) => setTable(e.target.value as TableName)}>
            {tableOptions.map((t) => (
              <option key={t} value={t}>
                {TABLE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {sheets.length > 1 && (
          <label className="fb-field">
            <span>Sheet</span>
            <select
              aria-label="Sheet"
              value={sheetIndex}
              onChange={(e) => {
                setSheetIndex(Number(e.target.value));
                setHeaderRow(null);
              }}
            >
              {sheets.map((s, i) => (
                <option key={i} value={i}>
                  {s.name} ({tabulate(s).rows.length} rows)
                </option>
              ))}
            </select>
          </label>
        )}
        {tab && (
          <label className="fb-field">
            <span>Headers on row</span>
            <input
              className="text-input narrow"
              type="number"
              min={1}
              max={Math.min(20, sheet?.rows.length ?? 1)}
              aria-label="Header row number"
              value={tab.headerRow}
              onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
        )}
      </div>

      {tab && (
        <div className="mapping">
          <table className="mapping-table">
            <caption>
              Column matching{remembered ? ', remembered from the last import of this layout' : ''}. Columns set to Skip are not imported.
            </caption>
            <thead>
              <tr>
                <th>In the file</th>
                <th>First values</th>
                <th>Goes to</th>
              </tr>
            </thead>
            <tbody>
              {tab.headers.map((h, i) => (
                <tr key={i} className={mapping[i] ? '' : 'skipped'}>
                  <td>{h}</td>
                  <td className="muted small">
                    {tab.rows
                      .map((r) => text(r.cells[i]))
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(', ')
                      .slice(0, 60)}
                  </td>
                  <td>
                    <select
                      aria-label={`Column for ${h}`}
                      value={mapping[i] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        // A column of the table takes one source column; picking it here frees it elsewhere.
                        setMapping(mapping.map((m, j) => (j === i ? v : m === v ? null : m)));
                        setRemembered(false);
                      }}
                    >
                      <option value="">Skip</option>
                      {COLUMNS[table].map((c) => (
                        <option key={c.name} value={c.name}>
                          {columnLabel(table, c.name)}
                          {c.required ? ' (required)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {missing.length > 0 && (
            <p className="callout warn small" role="alert">
              Pick a column for {missing.map((m) => columnLabel(table, m)).join(' and ')}. {TABLE_LABELS[table]} need it.
            </p>
          )}
        </div>
      )}

      {report && <Preview report={report} />}

      <label className="check">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace all {TABLE_LABELS[table].toLowerCase()} with this file (rows it does not have are removed)
      </label>
      {error && (
        <p className="callout warn" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button
          type="button"
          className="btn solid"
          onClick={commit}
          disabled={busy || !result?.data || changes + (report?.created.length ?? 0) === 0}
        >
          {changes ? `Import ${changes} row${changes === 1 ? '' : 's'}` : 'Nothing to import'}
        </button>
        {remaining > 0 && (
          <button type="button" className="btn" onClick={() => onDone(null)}>
            Skip this file
          </button>
        )}
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Preview({ report: r }: { report: ImportReport }) {
  if (r.fileErrors.length) {
    return (
      <div className="preview failed">
        <p>Nothing can be imported yet:</p>
        <ul>
          {r.fileErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="preview" aria-live="polite">
      <p>
        <strong>Ready:</strong> {r.added} new, {r.updated} updated
        {r.removed ? `, ${r.removed} removed` : ''}, {r.rejectedRows} rejected
        {r.warnings.length ? `, ${r.warnings.length} with a warning` : ''}.
      </p>
      <ReportDetails r={r} />
    </div>
  );
}

/** Created records, name matches, rejected rows, and warnings, shared by the preview and the final report. */
export function ReportDetails({ r }: { r: ImportReport }) {
  const byRow = new Map<number, string[]>();
  for (const issue of r.rejected) byRow.set(issue.row, [...(byRow.get(issue.row) ?? []), issue.reason]);
  // The same warning on many rows reads once, with its rows listed.
  const warnings = [...r.warnings.reduce((m, w) => m.set(w.reason, [...(m.get(w.reason) ?? []), w.row]), new Map<string, number[]>())];
  const companies = r.created.filter((c) => c.table === 'companies');
  const contacts = r.created.filter((c) => c.table === 'contacts');
  return (
    <>
      {companies.length > 0 && (
        <Listing
          title={`Adds ${companies.length} new compan${companies.length === 1 ? 'y' : 'ies'}`}
          items={companies.map((c) => c.name)}
        />
      )}
      {contacts.length > 0 && (
        <Listing
          title={`Adds ${contacts.length} new contact${contacts.length === 1 ? '' : 's'}`}
          items={contacts.map((c) => `${c.name} at ${c.at}`)}
        />
      )}
      {r.matches.length > 0 && (
        <Listing
          title={`Matched ${r.matches.length} name${r.matches.length === 1 ? '' : 's'} to records spelled differently`}
          items={r.matches.map((m) => `${m.from} → ${m.to}`)}
          open
        />
      )}
      {byRow.size > 0 && (
        <table className="issues">
          <caption>Rejected rows</caption>
          <thead>
            <tr>
              <th>Row</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {[...byRow].map(([row, reasons]) => (
              <tr key={row}>
                <td className="num">{row}</td>
                <td>
                  {reasons.map((x) => (
                    <div key={x}>{x}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {warnings.length > 0 && (
        <table className="issues warn">
          <caption>Imported with a warning</caption>
          <thead>
            <tr>
              <th>Rows</th>
              <th>Warning</th>
            </tr>
          </thead>
          <tbody>
            {warnings.map(([reason, rows]) => (
              <tr key={reason}>
                <td className="num">{rowList(rows)}</td>
                <td>{reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.ignoredColumns.length > 0 && <p className="muted small">Skipped columns: {r.ignoredColumns.join(', ')}.</p>}
    </>
  );
}

/** 4, 5, 6, 9 reads as 4-6, 9. */
function rowList(rows: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] === rows[j]! + 1) j++;
    out.push(j > i + 1 ? `${rows[i]}-${rows[j]}` : j === i + 1 ? `${rows[i]}, ${rows[j]}` : String(rows[i]));
    i = j;
  }
  return out.join(', ');
}

function Listing({ title, items, open = false }: { title: string; items: string[]; open?: boolean }) {
  return (
    <details className="listing" open={open || items.length <= 8}>
      <summary>{title}</summary>
      <ul>
        {items.slice(0, 200).map((x, i) => (
          <li key={i}>{x}</li>
        ))}
        {items.length > 200 && <li className="muted">and {items.length - 200} more</li>}
      </ul>
    </details>
  );
}
